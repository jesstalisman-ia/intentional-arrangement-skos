/*
 * schema-projection.js — shared Schema Binding engine
 *
 * Projects an ontology model onto implementation-target schemas, and maps those
 * schemas back, through an editable projection map. Transport-neutral: it works on
 * a small intermediate representation (IR) that either app converts to/from, so the
 * engine never depends on the SKOS editor's or the Ontology Studio's internal shape.
 *
 * Round-trip:  IR  --project-->  target artifact        (out)
 *              target artifact  --parse-->  IR           (in)
 *
 * Targets: mongo (Mongo $jsonSchema validator), graphql (SDL),
 *          swiftdata (@Model classes), obsidian (frontmatter property template).
 *
 * ---- IR shape ----
 * {
 *   namespace: "http://example.org/onto#", prefix: "ex",
 *   classes: [{
 *     id, label, comment, parents: [classId],
 *     properties: [{
 *       id, label, comment,
 *       kind: "data" | "object",
 *       range: "<xsd datatype qname/iri>"  (data)  |  "<classId>" (object),
 *       required: bool,      // min cardinality >= 1
 *       multiple: bool       // max cardinality > 1
 *     }]
 *   }]
 * }
 *
 * ---- Projection map (editable; defaults auto-generated) ----
 * {
 *   target: "mongo"|"graphql"|"swiftdata"|"obsidian",
 *   classes: {
 *     [classId]: {
 *       include: true, name: "TargetTypeName",
 *       properties: { [propId]: { include:true, name:"fieldName", type:"<override|null>", required, multiple } }
 *     }
 *   }
 * }
 * Only overrides need to be stored; anything missing falls back to the default.
 */
(function (root) {
  "use strict";

  // ---- naming helpers ----
  const words = s => String(s || "").trim().split(/[\s_\-./#]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);
  const pascal = s => words(s).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("") || "Item";
  const camel = s => { const p = pascal(s); return p.charAt(0).toLowerCase() + p.slice(1) || "field"; };
  const localOf = r => String(r || "").split(/[#/]/).pop();

  // ---- datatype mapping tables (xsd local name -> target type) ----
  // Accept qnames ("xsd:integer"), full IRIs (".../XMLSchema#integer"), or bare names.
  const XSD = r => String(r || "").split(/[:#/]/).pop().toLowerCase();
  const TYPEMAP = {
    mongo: { string: "string", normalizedstring: "string", token: "string", anyuri: "string",
      integer: "int", int: "int", long: "long", short: "int", nonnegativeinteger: "int", positiveinteger: "int",
      decimal: "double", float: "double", double: "double", boolean: "bool",
      date: "date", datetime: "date", time: "string", gyear: "int", default: "string" },
    graphql: { string: "String", normalizedstring: "String", token: "String", anyuri: "String",
      integer: "Int", int: "Int", long: "Int", short: "Int", nonnegativeinteger: "Int", positiveinteger: "Int",
      decimal: "Float", float: "Float", double: "Float", boolean: "Boolean",
      date: "String", datetime: "String", time: "String", gyear: "Int", default: "String" },
    swiftdata: { string: "String", normalizedstring: "String", token: "String", anyuri: "URL",
      integer: "Int", int: "Int", long: "Int", short: "Int", nonnegativeinteger: "Int", positiveinteger: "Int",
      decimal: "Double", float: "Double", double: "Double", boolean: "Bool",
      date: "Date", datetime: "Date", time: "String", gyear: "Int", default: "String" },
    obsidian: { string: "text", normalizedstring: "text", token: "text", anyuri: "text",
      integer: "number", int: "number", long: "number", short: "number", nonnegativeinteger: "number", positiveinteger: "number",
      decimal: "number", float: "number", double: "number", boolean: "checkbox",
      date: "date", datetime: "datetime", time: "text", gyear: "number", default: "text" },
  };
  const dataType = (target, range) => (TYPEMAP[target][XSD(range)] || TYPEMAP[target].default);

  // ---- default projection map ----
  function defaultMap(ir, target) {
    const classes = {};
    for (const c of ir.classes || []) {
      const props = {};
      for (const p of c.properties || []) {
        props[p.id] = { include: true, name: camel(p.label || p.id), type: null, required: !!p.required, multiple: !!p.multiple };
      }
      classes[c.id] = { include: true, name: pascal(c.label || c.id), properties: props };
    }
    return { target, classes };
  }
  // Merge stored overrides on top of a fresh default, so a saved map never goes stale.
  function resolveMap(ir, target, saved) {
    const base = defaultMap(ir, target);
    if (!saved || !saved.classes) return base;
    for (const cid in base.classes) {
      const sc = saved.classes[cid]; if (!sc) continue;
      const bc = base.classes[cid];
      if (sc.include === false) bc.include = false;
      if (sc.name) bc.name = sc.name;
      for (const pid in bc.properties) {
        const sp = sc.properties && sc.properties[pid]; if (!sp) continue;
        Object.assign(bc.properties[pid], sp);
      }
    }
    return base;
  }

  const classById = ir => { const m = {}; for (const c of ir.classes || []) m[c.id] = c; return m; };
  const refName = (map, id) => (map.classes[id] && map.classes[id].name) || pascal(id);

  // ================= PROJECT OUT =================

  function toMongo(ir, map) {
    const byId = classById(ir);
    const out = [];
    for (const c of ir.classes || []) {
      const cm = map.classes[c.id]; if (!cm || cm.include === false) continue;
      const required = [], props = {};
      for (const p of c.properties || []) {
        const pm = cm.properties[p.id]; if (!pm || pm.include === false) continue;
        let spec;
        if (p.kind === "object") {
          spec = { bsonType: "objectId", description: "ref -> " + refName(map, p.range) };
        } else {
          spec = { bsonType: pm.type || dataType("mongo", p.range) };
        }
        props[pm.name] = pm.multiple ? { bsonType: "array", items: spec } : spec;
        if (pm.required) required.push(pm.name);
      }
      const validator = { $jsonSchema: { bsonType: "object", title: cm.name,
        ...(required.length ? { required } : {}), properties: props } };
      out.push({ collection: camel(cm.name) + "s", validator });
    }
    return JSON.stringify(out, null, 2);
  }

  function toGraphQL(ir, map) {
    const lines = [];
    for (const c of ir.classes || []) {
      const cm = map.classes[c.id]; if (!cm || cm.include === false) continue;
      if (c.comment) lines.push('"""' + c.comment + '"""');
      lines.push("type " + cm.name + " {");
      lines.push("  id: ID!");
      for (const p of c.properties || []) {
        const pm = cm.properties[p.id]; if (!pm || pm.include === false) continue;
        let t = p.kind === "object" ? refName(map, p.range) : (pm.type || dataType("graphql", p.range));
        if (pm.multiple) t = "[" + t + "!]";
        if (pm.required) t += "!";
        lines.push("  " + pm.name + ": " + t);
      }
      lines.push("}", "");
    }
    return lines.join("\n").trim() + "\n";
  }

  function toSwiftData(ir, map) {
    const lines = ["import Foundation", "import SwiftData", ""];
    for (const c of ir.classes || []) {
      const cm = map.classes[c.id]; if (!cm || cm.include === false) continue;
      if (c.comment) lines.push("/// " + c.comment);
      lines.push("@Model");
      lines.push("final class " + cm.name + " {");
      for (const p of c.properties || []) {
        const pm = cm.properties[p.id]; if (!pm || pm.include === false) continue;
        let t, isRel = p.kind === "object";
        if (isRel) t = refName(map, p.range);
        else t = pm.type || dataType("swiftdata", p.range);
        let decl;
        if (pm.multiple) decl = "var " + pm.name + ": [" + t + "]" + (isRel ? "" : " = []");
        else if (pm.required) decl = "var " + pm.name + ": " + t;
        else decl = "var " + pm.name + ": " + t + "?";
        if (isRel) lines.push("  @Relationship var " + decl.replace(/^var /, ""));
        else lines.push("  " + decl);
      }
      lines.push("}", "");
    }
    return lines.join("\n").trim() + "\n";
  }

  function toObsidian(ir, map) {
    // One note template per class: YAML frontmatter with typed properties, plus a
    // machine-readable "Types" table so it round-trips.
    const blocks = [];
    for (const c of ir.classes || []) {
      const cm = map.classes[c.id]; if (!cm || cm.include === false) continue;
      const fm = ["---", "type: " + cm.name];
      const types = [];
      for (const p of c.properties || []) {
        const pm = cm.properties[p.id]; if (!pm || pm.include === false) continue;
        const ot = p.kind === "object" ? "list" : (pm.type || dataType("obsidian", p.range));
        let sample;
        if (p.kind === "object") sample = pm.multiple ? '["[[Example]]"]' : '"[[Example]]"';
        else if (ot === "number") sample = pm.multiple ? "[0]" : "0";
        else if (ot === "checkbox") sample = "false";
        else if (ot === "date" || ot === "datetime") sample = '""';
        else sample = pm.multiple ? "[]" : '""';
        fm.push(pm.name + ": " + sample);
        // encode object range as "link → ClassName" so it round-trips
        const spec = p.kind === "object" ? ("link → " + refName(map, p.range)) : ot;
        types.push("| " + pm.name + " | " + spec + (pm.multiple ? " (list)" : "") + (pm.required ? " · required" : "") + " |");
      }
      fm.push("---", "");
      blocks.push("# " + cm.name + " (note template)\n\n" + fm.join("\n") +
        "\n**Properties**\n\n| property | type |\n|---|---|\n" + types.join("\n") + "\n");
    }
    return blocks.join("\n\n");
  }

  const PROJECTORS = { mongo: toMongo, graphql: toGraphQL, swiftdata: toSwiftData, obsidian: toObsidian };
  function project(ir, target, savedMap) {
    const fn = PROJECTORS[target]; if (!fn) throw new Error("Unknown target: " + target);
    return fn(ir, resolveMap(ir, target, savedMap));
  }

  // ================= MAP IN (parse -> IR) =================
  // Reverse datatype: target type -> a reasonable xsd range.
  const REVXSD = { string: "xsd:string", text: "xsd:string", int: "xsd:integer", long: "xsd:integer",
    integer: "xsd:integer", number: "xsd:decimal", double: "xsd:decimal", float: "xsd:decimal",
    bool: "xsd:boolean", boolean: "xsd:boolean", checkbox: "xsd:boolean",
    date: "xsd:date", datetime: "xsd:dateTime", url: "xsd:anyURI", id: "xsd:string" };
  const revRange = t => REVXSD[String(t || "").toLowerCase()] || "xsd:string";
  const NS = "http://example.org/projected#";

  function fromGraphQL(sdl) {
    const classes = [], typeNames = new Set();
    const typeRe = /type\s+(\w+)\s*\{([^}]*)\}/g;
    let m; const bodies = [];
    while ((m = typeRe.exec(sdl))) { typeNames.add(m[1]); bodies.push([m[1], m[2]]); }
    for (const [name, body] of bodies) {
      const props = [];
      for (const line of body.split("\n")) {
        const fm = line.match(/^\s*(\w+)\s*:\s*(.+?)\s*$/); if (!fm) continue;
        const fname = fm[1]; if (fname === "id") continue;
        let t = fm[2].trim(), required = /!$/.test(t.replace(/\]!?$/, "")), multiple = /^\[/.test(t);
        t = t.replace(/[\[\]!]/g, "");
        const isObj = typeNames.has(t);
        props.push({ id: fname, label: fname, kind: isObj ? "object" : "data",
          range: isObj ? t : revRange(t), required: /!\s*$/.test(fm[2]), multiple });
      }
      classes.push({ id: name, label: name, properties: props });
    }
    return { namespace: NS, prefix: "px", classes };
  }

  function fromMongo(text) {
    let arr; try { arr = JSON.parse(text); } catch (e) { throw new Error("Mongo import expects JSON ($jsonSchema): " + e.message); }
    if (!Array.isArray(arr)) arr = [arr];
    const classes = [];
    for (const entry of arr) {
      const schema = (entry.validator && entry.validator.$jsonSchema) || entry.$jsonSchema || entry;
      if (!schema || !schema.properties) continue;
      const req = new Set(schema.required || []);
      const name = schema.title || pascal(entry.collection || "Type");
      const props = [];
      for (const pn in schema.properties) {
        const s = schema.properties[pn], multiple = s.bsonType === "array";
        const spec = multiple ? (s.items || {}) : s;
        const isObj = spec.bsonType === "objectId";
        props.push({ id: pn, label: pn, kind: isObj ? "object" : "data",
          range: isObj ? pascal((spec.description || "").replace(/^ref\s*->\s*/, "") || "Thing") : revRange(spec.bsonType),
          required: req.has(pn), multiple });
      }
      classes.push({ id: name, label: name, properties: props });
    }
    return { namespace: NS, prefix: "px", classes };
  }

  function fromObsidian(text) {
    // One chunk per "# Name" heading (frontmatter --- inside a chunk is left intact).
    const classes = [];
    const chunks = text.split(/\n(?=#\s+\S)/);
    for (const b of chunks) {
      const tm = b.match(/type:\s*(\w+)/) || b.match(/#\s+(\w+)/);
      if (!tm) continue;
      const props = [];
      const rowRe = /\|\s*([A-Za-z0-9_]+)\s*\|\s*([^|]+?)\s*\|/g;
      let r;
      while ((r = rowRe.exec(b))) {
        const name = r[1], spec = r[2];
        if (name === "property") continue;
        const multiple = /\(list\)/.test(spec), required = /required/.test(spec);
        const link = spec.match(/link\s*(?:→|->)\s*(\w+)/);
        if (link) props.push({ id: name, label: name, kind: "object", range: link[1], required, multiple });
        else { const ot = (spec.match(/[a-zA-Z]+/) || ["text"])[0]; props.push({ id: name, label: name, kind: "data", range: revRange(ot), required, multiple }); }
      }
      classes.push({ id: tm[1], label: tm[1], properties: props });
    }
    return { namespace: NS, prefix: "px", classes };
  }

  const PARSERS = { graphql: fromGraphQL, mongo: fromMongo, obsidian: fromObsidian };
  function parse(target, text) {
    const fn = PARSERS[target];
    if (!fn) throw new Error("Import not supported for target: " + target + " (out-only)");
    return fn(text);
  }

  const API = { defaultMap, resolveMap, project, parse, TYPEMAP,
    targets: Object.keys(PROJECTORS), importable: Object.keys(PARSERS),
    _helpers: { pascal, camel, dataType } };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.SchemaProjection = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
