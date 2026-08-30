// ============================================================================
// TXMST — core logic (pure, testable). Exposed as global `Core`.
// Model → triples, Turtle/RDF-XML serialization, Turtle import,
// qSKOS-inspired validation, and a SPARQL SELECT engine.
// ============================================================================
(function (root) {
"use strict";

// ---- namespaces ----
const NS = {
  skos: "http://www.w3.org/2004/02/skos/core#",
  skosxl: "http://www.w3.org/2008/05/skos-xl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  dcterms: "http://purl.org/dc/terms/",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  isothes: "http://purl.org/iso25964/skos-thes#",
  foaf: "http://xmlns.com/foaf/0.1/",
  prov: "http://www.w3.org/ns/prov#",
  owl: "http://www.w3.org/2002/07/owl#",
  vann: "http://purl.org/vocab/vann/",
};

// ---- term constructors ----
const iri = v => ({ t: "iri", v });
const lit = (v, lang, dt) => ({ t: "lit", v, lang: lang || "", dt: dt || "" });
function termId(x){
  return x.t === "bnode" ? "B" + x.v : x.t === "iri" ? "I" + x.v : "L" + x.v + "" + x.lang + "" + x.dt;
}
const bnode = v => ({ t: "bnode", v });

// ---- model helpers ----
const LABEL_FIELDS = ["pref", "alt", "hidden"];
const NOTE_FIELDS = ["definition", "scopeNote", "changeNote", "historyNote", "editorialNote", "example"];
const MAP_FIELDS = ["exactMatch", "closeMatch", "broadMatch", "narrowMatch", "relatedMatch"];
// ISO 25964 (iso-thes) specialised hierarchy. Stored broader-side; narrower is the inverse.
const ISO_BROADER = ["broaderGeneric", "broaderPartitive", "broaderInstantial"];
const ISO_INVERSE = { broaderGeneric: "narrowerGeneric", broaderPartitive: "narrowerPartitive", broaderInstantial: "narrowerInstantial" };
// Which specialisations also assert their skos:broader super-property. Partitive is kept out for now.
// iso-thes (http://purl.org/iso25964/skos-thes) declares ALL THREE specialisations
// subproperties of skos:broader — partitive included (#60).
const ISO_ENTAILS_SKOS = { broaderGeneric: true, broaderPartitive: true, broaderInstantial: true };
const XL_PRED = { pref: "prefLabel", alt: "altLabel", hidden: "hiddenLabel" };
const SKOS_LABEL_PRED = { pref: "prefLabel", alt: "altLabel", hidden: "hiddenLabel" };

function conceptUri(model, id){ return model.base + id; }
// A concept keeps its ORIGINAL URI when it came from another namespace (federated
// imports): c.uri overrides the minted base+id everywhere the concept is referenced.
function conceptRes(model, id){ const c = model.concepts && model.concepts[id]; return (c && c.uri) ? c.uri : model.base + id; }

function emptyConcept(id){
  return { id, notation: "", pref: [], alt: [], hidden: [],
    definition: [], scopeNote: [], changeNote: [], historyNote: [], editorialNote: [], example: [],
    broader: [], related: [],
    broaderGeneric: [], broaderPartitive: [], broaderInstantial: [],
    rdfsLabel: [], comment: [], source: [],
    exactMatch: [], closeMatch: [], broadMatch: [], narrowMatch: [], relatedMatch: [],
    creator: "", created: "", issued: "", modified: "",
    artifacts: [], history: [], extra: [], top: false };
}

// safe local name for XL label URIs
function safeLocal(s){
  return String(s).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
}
function xlLabelUri(model, cid, kind, index, lang){
  return model.base + cid + "-xl-" + kind + "-" + (lang || "und") + "-" + index;
}

// ============================================================================
// Build triples (canonical). opts: {xl:bool, dumbDown:bool, dc:bool}
// xl=true emits skosxl reified labels; dumbDown=true also emits plain skos labels.
// When xl=false, plain skos labels are always emitted.
// ============================================================================
function isoDateTime(ts){ try{ return new Date(ts).toISOString().replace(/\.\d{3}Z$/, "Z"); }catch(e){ return null; } }
// dcterms:created/issued/modified fields hold calendar dates. A dateTime can leak in
// (older exports emitted history-derived xsd:dateTime stamps, which an import then
// filed into these fields — #55/#56): reduce it to its date part so the value always
// sits inside xsd:date's lexical space. Anything unrecognizable passes through untouched.
function dateOnly(v){ const s = String(v == null ? "" : v).trim(); const m = s.match(/^(\d{4}-\d{2}-\d{2})([T ]|$)/); return m ? m[1] : s; }
// Agents & documents are provenance ABOUT the vocabulary, not members of it (#57):
// mint them under the scheme's dedicated annex namespace when one is set (slash or
// hash form both allowed), the concept namespace otherwise — an explicit identity
// URI on the record (ORCID, DOI, homepage) always wins.
function annexNs(model, kind){
  const sc = model.scheme || {};
  // documents get their own namespace when one is set (#63), falling back to the
  // agents namespace (#57), falling back to the concept namespace
  const b = (kind === "doc" && (sc.docsBase || "").trim()) || (sc.agentsBase || "").trim();
  if (!/^https?:\/\//i.test(b)) return "";
  return b + (/[#\/]$/.test(b) ? "" : "/");
}
function annexUri(model, rec, id, kind){
  if (rec && rec.uri && /^https?:\/\//i.test(rec.uri)) return rec.uri;
  const ns = annexNs(model, kind);
  return ns ? ns + id : conceptUri(model, id);
}
function buildTriples(model, opts){
  opts = opts || {};
  const T = [];
  // Every triple emits exactly once (#51 — plain skos:broader plus an entailing
  // iso-thes broader used to produce duplicate skos:broader statements).
  const _seenT = new Set();
  const add = (s, p, o) => { const k = termId(s) + "|" + termId(p) + "|" + termId(o);
    if (_seenT.has(k)) return; _seenT.add(k); T.push({ s, p, o }); };
  const A = iri(NS.rdf + "type");
  const schemeUri = model.scheme.uri || (model.base.replace(/[#/]$/, ""));

  // scheme
  add(iri(schemeUri), A, iri(NS.skos + "ConceptScheme"));
  if (opts.dc){
    const s = iri(schemeUri), L = model.scheme.lang || model.defaultLang || "en";
    const dct = k => iri(NS.dcterms + k);
    if (model.scheme.title) add(s, dct("title"), lit(model.scheme.title, L));
    if (model.scheme.description) add(s, dct("description"), lit(model.scheme.description, L));
    // creator / publisher / contributor — an agent reference (prov:Agent) if set, else the plain literal
    const _ag = model.agents || {};
    const _resUri = (rec, id) => annexUri(model, rec, id);
    if (model.scheme.creatorAgent && _ag[model.scheme.creatorAgent]) add(s, dct("creator"), iri(_resUri(_ag[model.scheme.creatorAgent], model.scheme.creatorAgent)));
    else if (model.scheme.creator) add(s, dct("creator"), lit(model.scheme.creator, L));
    if (model.scheme.publisherAgent && _ag[model.scheme.publisherAgent]) add(s, dct("publisher"), iri(_resUri(_ag[model.scheme.publisherAgent], model.scheme.publisherAgent)));
    else if (model.scheme.publisher) add(s, dct("publisher"), lit(model.scheme.publisher, L));
    { const _cl = Array.isArray(model.scheme.contributorAgents) ? model.scheme.contributorAgents : (model.scheme.contributorAgent ? [model.scheme.contributorAgent] : []);
      _cl.forEach(aid => { if (_ag[aid]) add(s, dct("contributor"), iri(_resUri(_ag[aid], aid))); }); }
    if (model.scheme.created) add(s, dct("created"), lit(dateOnly(model.scheme.created), "", NS.xsd + "date"));
    if (model.scheme.issued) add(s, dct("issued"), lit(dateOnly(model.scheme.issued), "", NS.xsd + "date"));
    if (model.scheme.modified) add(s, dct("modified"), lit(dateOnly(model.scheme.modified), "", NS.xsd + "date"));
    if (model.scheme.rights) add(s, dct("rights"), lit(model.scheme.rights, L));
    // publication metadata (#45 #46 #47): license as a URI, version, and the
    // vann namespace annotations derived from the workspace's own base + prefix
    if (model.scheme.license && /^https?:\/\//i.test(model.scheme.license)) add(s, dct("license"), iri(model.scheme.license));
    if (model.scheme.version) add(s, iri(NS.owl + "versionInfo"), lit(model.scheme.version));
    if (model.prefix) add(s, iri(NS.vann + "preferredNamespacePrefix"), lit(model.prefix));
    if (model.base) add(s, iri(NS.vann + "preferredNamespaceUri"), lit(model.base));
    // dcterms:language — the vocabulary's default language as a BCP-47 tag (plain literal)
    const lg = (model.scheme.lang || model.defaultLang || "").trim();
    if (lg) add(s, dct("language"), lit(lg));
    // Passthrough: scheme-level metadata we don't model (dcterms:license, subject, conformsTo, …)
    (model.scheme.extra || []).forEach(e => { if (e && e.p && e.o) add(s, iri(e.p), e.o.t === "iri" ? iri(e.o.v) : lit(e.o.v || "", e.o.lang || "", e.o.dt || "")); });
  }

  const ids = model.order && model.order.length ? model.order : Object.keys(model.concepts);
  for (const id of ids){
    const c = model.concepts[id]; if (!c) continue;
    const s = iri(conceptRes(model, id));
    add(s, A, iri(NS.skos + "Concept"));
    // a foreign-namespace concept keeps its own scheme membership (preserved in
    // c.extra) — never assert it into this workspace's scheme
    if (!c.uri){ add(s, iri(NS.skos + "inScheme"), iri(schemeUri));
      if (c.top){
        add(s, iri(NS.skos + "topConceptOf"), iri(schemeUri));
        add(iri(schemeUri), iri(NS.skos + "hasTopConcept"), s);
      } }
    if (c.notation) add(s, iri(NS.skos + "notation"), lit(c.notation, "", NS.xsd + "string"));

    // labels
    for (const kind of LABEL_FIELDS){
      (c[kind] || []).forEach((L, i) => {
        if (!L.val) return;
        const plain = () => add(s, iri(NS.skos + SKOS_LABEL_PRED[kind]), lit(L.val, L.lang));
        if (opts.xl){
          const lu = iri(L.uri || xlLabelUri(model, id, kind, i + 1, L.lang));
          add(s, iri(NS.skosxl + XL_PRED[kind]), lu);
          add(lu, A, iri(NS.skosxl + "Label"));
          add(lu, iri(NS.skosxl + "literalForm"), lit(L.val, L.lang));
          if (L.source) add(lu, iri(NS.dcterms + "source"), lit(L.source, L.lang));
          if (opts.dumbDown) plain();
        } else plain();
      });
    }
    // documentation
    for (const kind of NOTE_FIELDS)
      (c[kind] || []).forEach(L => { if (L.val) add(s, iri(NS.skos + kind), lit(L.val, L.lang)); });
    // rdfs:label (optional alternate name) + rdfs:comment
    (c.rdfsLabel || []).forEach(L => { if (L.val) add(s, iri(NS.rdfs + "label"), lit(L.val, L.lang)); });
    (c.comment || []).forEach(L => { if (L.val) add(s, iri(NS.rdfs + "comment"), lit(L.val, L.lang)); });
    // dct:source -> foaf:Document
    (c.source || []).forEach(did => { const _d = model.documents && model.documents[did]; if (_d) add(s, iri(NS.dcterms + "source"), iri(annexUri(model, _d, did, "doc"))); });
    // per-concept Dublin Core metadata (editable fields)
    if (c.creator){
      // a creator string naming a registered agent exports as that agent's URI —
      // same practice as the scheme's attribution (#59); a URI passes through as
      // a URI; anything else stays a literal
      const _cv = String(c.creator).trim(); const _ags = model.agents || {};
      const _hit = Object.keys(_ags).find(aid => (_ags[aid].name || "").trim().toLowerCase() === _cv.toLowerCase());
      if (_hit) add(s, iri(NS.dcterms + "creator"), iri(annexUri(model, _ags[_hit], _hit)));
      else if (/^https?:\/\//i.test(_cv)) add(s, iri(NS.dcterms + "creator"), iri(_cv));
      else add(s, iri(NS.dcterms + "creator"), lit(_cv, ""));
    }
    if (c.created) add(s, iri(NS.dcterms + "created"), lit(dateOnly(c.created), "", NS.xsd + "date"));
    if (c.issued) add(s, iri(NS.dcterms + "issued"), lit(dateOnly(c.issued), "", NS.xsd + "date"));
    if (c.modified) add(s, iri(NS.dcterms + "modified"), lit(dateOnly(c.modified), "", NS.xsd + "date"));
    // Passthrough: any other imported metadata the editor does not model (ISO 25964,
    // or any predicate beyond the fields above) is re-emitted verbatim so nothing is
    // dropped on a round-trip.
    (c.extra || []).forEach(e => {
      if (!e || !e.p || !e.o) return;
      add(s, iri(e.p), e.o.t === "iri" ? iri(e.o.v) : lit(e.o.v || "", e.o.lang || "", e.o.dt || ""));
    });

    // hierarchy + associative (assert both directions for broader/narrower)
    // a plain skos:broader that an iso-thes field already entails is redundant —
    // same rule the importer applies (ISO_ENTAILS_SKOS), so round-trips agree
    const _entailedB = new Set();
    for (const _f of ISO_BROADER){ if (ISO_ENTAILS_SKOS[_f]) (c[_f] || []).forEach(p => _entailedB.add(p)); }
    (c.broader || []).forEach(pid => {
      if (!model.concepts[pid] || _entailedB.has(pid)) return;
      add(s, iri(NS.skos + "broader"), iri(conceptRes(model, pid)));
      add(iri(conceptRes(model, pid)), iri(NS.skos + "narrower"), s);
    });
    (c.related || []).forEach(rid => {
      if (!model.concepts[rid]) return;
      add(s, iri(NS.skos + "related"), iri(conceptRes(model, rid)));
    });
    // ISO 25964 specialised hierarchy (iso-thes). Emit the specialisation + its narrower
    // inverse; every specialisation also asserts its skos:broader super-property (all
    // three are subproperties of skos:broader in iso-thes, #60), so plain-SKOS
    // consumers always see the hierarchy.
    for (const fld of ISO_BROADER){
      (c[fld] || []).forEach(pid => {
        if (!model.concepts[pid]) return;
        const pu = iri(conceptRes(model, pid));
        add(s, iri(NS.isothes + fld), pu);
        add(pu, iri(NS.isothes + ISO_INVERSE[fld]), s);
        if (ISO_ENTAILS_SKOS[fld]){ add(s, iri(NS.skos + "broader"), pu); add(pu, iri(NS.skos + "narrower"), s); }
      });
    }
    // mappings
    for (const m of MAP_FIELDS)
      (c[m] || []).forEach(u => { if (u) add(s, iri(NS.skos + m), iri(u)); });
    // linked artifacts (documents, images, spreadsheets, wikis) as rdfs:seeAlso
    (c.artifacts || []).forEach(a => { if (a && a.url) add(s, iri(NS.rdfs + "seeAlso"), iri(a.url)); });
    // provenance timestamps + the recorded edit history, exported as skos:changeNote
    if (opts.dc && c.history && c.history.length){
      const times = c.history.map(h => h.ts).filter(Boolean);
      if (times.length){
        // one value per property (#55): the editable date fields are authoritative;
        // history-derived dateTime stamps only fill in where no field is set
        const ci = isoDateTime(Math.min.apply(null, times)), mi = isoDateTime(Math.max.apply(null, times));
        if (ci && !c.created) add(s, iri(NS.dcterms + "created"), lit(ci, "", NS.xsd + "dateTime"));
        if (mi && !c.modified) add(s, iri(NS.dcterms + "modified"), lit(mi, "", NS.xsd + "dateTime"));
      }
      // each history entry → one skos:changeNote (date — what changed; by whom)
      c.history.forEach(h => {
        const changes = (h.changes || []).filter(Boolean).join("; ");
        if (!changes) return;
        const when = h.ts ? (isoDateTime(h.ts) || "").slice(0, 10) : "";
        const who = h.author ? " (by " + h.author + ")" : "";
        add(s, iri(NS.skos + "changeNote"), lit((when ? when + " — " : "") + changes + who, ""));
      });
    }
  }
  // collections — skos:Collection (unordered) / skos:OrderedCollection (ordered)
  let _bn = 0;
  for (const cid in (model.collections || {})){
    const col = model.collections[cid];
    const cs = iri(conceptUri(model, cid));
    add(cs, A, iri(NS.skos + (col.ordered ? "OrderedCollection" : "Collection")));
    // labels at parity with concepts (#58): first label per language is the
    // skos:prefLabel (S14-safe), any further same-language labels are altLabels
    { const _pl = {};
      (col.label || []).forEach(L => { if (!L.val) return; const k = L.lang || "";
        if (!_pl[k]){ _pl[k] = 1; add(cs, iri(NS.skos + "prefLabel"), lit(L.val, L.lang)); }
        else add(cs, iri(NS.skos + "altLabel"), lit(L.val, L.lang)); }); }
    (col.note || []).forEach(L => { if (L.val) add(cs, iri(NS.skos + "note"), lit(L.val, L.lang)); });
    add(cs, iri(NS.skos + "inScheme"), iri(schemeUri));
    if (col.created) add(cs, iri(NS.dcterms + "created"), lit(dateOnly(col.created), "", NS.xsd + "date"));
    if (col.modified) add(cs, iri(NS.dcterms + "modified"), lit(dateOnly(col.modified), "", NS.xsd + "date"));
    const mems = (col.members || []).filter(mid => model.concepts[mid] || (model.collections && model.collections[mid]));
    mems.forEach(mid => add(cs, iri(NS.skos + "member"), iri(model.concepts[mid] ? conceptRes(model, mid) : conceptUri(model, mid))));
    if (col.ordered && mems.length){        // ordered members as an rdf:List via skos:memberList
      let head = null, prev = null;
      mems.forEach(mid => {
        const node = bnode("L" + cid.replace(/[^A-Za-z0-9]/g, "") + "_" + (++_bn));
        add(node, iri(NS.rdf + "first"), iri(model.concepts[mid] ? conceptRes(model, mid) : conceptUri(model, mid)));
        if (prev) add(prev, iri(NS.rdf + "rest"), node); else head = node;
        prev = node;
      });
      add(prev, iri(NS.rdf + "rest"), iri(NS.rdf + "nil"));
      add(cs, iri(NS.skos + "memberList"), head);
    }
  }
  // foaf:Document sources
  for (const did in (model.documents || {})){
    const d = model.documents[did]; const du = iri(annexUri(model, d, did, "doc"));
    add(du, A, iri(NS.foaf + "Document"));
    (d.title || []).forEach(L => { if (L.val) add(du, iri(NS.dcterms + "title"), lit(L.val, L.lang)); });
    (d.page || []).forEach(u => { if (u) add(du, iri(NS.foaf + "page"), iri(u)); });
    (d.comment || []).forEach(L => { if (L.val) add(du, iri(NS.rdfs + "comment"), lit(L.val, L.lang)); });
  }
  // prov:Agent — Person / Organization / SoftwareAgent
  const _agentCls = { person: "Person", organization: "Organization", software: "SoftwareAgent" };
  for (const aid in (model.agents || {})){
    const a = model.agents[aid]; const au = iri(annexUri(model, a, aid));
    add(au, A, iri(NS.prov + (_agentCls[a.kind] || "Person")));
    if (a.name) add(au, iri(NS.foaf + "name"), lit(a.name));
    if (a.homepage) add(au, iri(NS.foaf + "homepage"), iri(a.homepage));
  }
  // foreign triples — second schemes and other subjects preserved verbatim from a
  // federated import (multi-namespace fidelity)
  const _ft = x => x.t === "iri" ? iri(x.v) : x.t === "bnode" ? bnode(x.v) : lit(x.v, x.lang, x.dt);
  (model.foreign || []).forEach(f => { try{ add(_ft(f.s), _ft(f.p), _ft(f.o)); }catch(e){} });
  return { triples: T, schemeUri };
}

// ============================================================================
// Turtle serialization (direct from model for clean, grouped output)
// ============================================================================
function escLit(s){
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}
function qname(model, uri){
  for (const [p, ns] of Object.entries(NS)) if (uri.startsWith(ns)){
    const loc = uri.slice(ns.length);
    if (/^[A-Za-z_][\w.-]*$/.test(loc)) return p + ":" + loc;
  }
  if (uri.startsWith(model.base)){
    const loc = uri.slice(model.base.length);
    // allow digit-leading locals (valid Turtle PN_LOCAL) so 32-char UUID ids compact to :xxxx
    if (/^[A-Za-z0-9_][\w.-]*$/.test(loc)) return (model.prefix || "") + ":" + loc;
  }
  const _dns = annexNs(model, "doc"), _ans = annexNs(model);
  if (_dns && _dns !== _ans && uri.startsWith(_dns)){
    const loc = uri.slice(_dns.length);
    if (/^[A-Za-z0-9_][\w.-]*$/.test(loc)) return "resources:" + loc;
  }
  if (_ans && uri.startsWith(_ans)){
    const loc = uri.slice(_ans.length);
    if (/^[A-Za-z0-9_][\w.-]*$/.test(loc)) return "agents:" + loc;
  }
  return "<" + uri + ">";
}
function termTurtle(model, o){
  if (o.t === "bnode") return "_:" + o.v;
  if (o.t === "iri") return qname(model, o.v);
  let s = '"' + escLit(o.v) + '"';
  if (o.lang) s += "@" + o.lang;
  else if (o.dt) s += "^^" + qname(model, o.dt);
  return s;
}
function toTurtle(model, opts){
  const { triples } = (opts && opts._triples) ? { triples: opts._triples } : buildTriples(model, opts);
  // group by subject preserving first-seen order
  const order = [], groups = new Map();
  for (const t of triples){
    const k = termId(t.s);
    if (!groups.has(k)){ groups.set(k, { s: t.s, preds: new Map() }); order.push(k); }
    const g = groups.get(k);
    const pk = t.p.v;
    if (!g.preds.has(pk)) g.preds.set(pk, []);
    g.preds.get(pk).push(t.o);
  }
  let out = "";
  const usedNs = new Set(["skos", "rdf"]);
  for (const p of Object.keys(NS)) usedNs.add(p);
  for (const p of Object.keys(NS))
    out += "@prefix " + p + ": <" + NS[p] + "> .\n";
  out += "@prefix " + (model.prefix || "") + ": <" + model.base + "> .\n";
  // the annex namespaces for provenance resources are source namespaces of this
  // document — declare them like every other one (#57, #63)
  const _abDecl = annexNs(model), _dbDecl = annexNs(model, "doc");
  if (_abDecl) out += "@prefix agents: <" + _abDecl + "> .\n";
  if (_dbDecl && _dbDecl !== _abDecl) out += "@prefix resources: <" + _dbDecl + "> .\n";
  out += "\n";

  const rdfType = NS.rdf + "type";
  for (const k of order){
    const g = groups.get(k);
    const preds = [...g.preds.entries()];
    // put rdf:type first
    preds.sort((a, b) => (a[0] === rdfType ? -1 : b[0] === rdfType ? 1 : 0));
    const lines = preds.map(([pk, objs]) => {
      const pstr = pk === rdfType ? "a" : qname(model, pk);
      const ostr = objs.map(o => termTurtle(model, o)).join(", ");
      return "    " + pstr + " " + ostr;
    });
    out += termTurtle(model, g.s) + " " + lines.join(" ;\n").replace(/^ {4}/, "") + " .\n\n";
  }
  return out.trimEnd() + "\n";
}

// ============================================================================
// RDF/XML serialization (subset)
// ============================================================================
function xmlEsc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function toRdfXml(model, opts){
  const { triples } = (opts && opts._triples) ? { triples: opts._triples } : buildTriples(model, opts);
  const order = [], groups = new Map();
  for (const t of triples){
    const k = termId(t.s);
    if (!groups.has(k)){ groups.set(k, { s: t.s, arr: [] }); order.push(k); }
    groups.get(k).arr.push(t);
  }
  const pfxName = uri => { for (const [p, ns] of Object.entries(NS)) if (uri.startsWith(ns)) return [p, uri.slice(ns.length)]; return null; };
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF';
  for (const [p, ns] of Object.entries(NS)) out += `\n    xmlns:${p}="${ns}"`;
  const _axml = annexNs(model), _dxml = annexNs(model, "doc");
  if (_axml) out += `\n    xmlns:agents="${xmlEsc(_axml)}"`;
  if (_dxml && _dxml !== _axml) out += `\n    xmlns:resources="${xmlEsc(_dxml)}"`;
  out += `\n    xmlns="${model.base}">\n`;
  const rdfType = NS.rdf + "type";
  for (const k of order){
    const g = groups.get(k);
    const idAttr = g.s.t === "bnode" ? `rdf:nodeID="${xmlEsc(g.s.v)}"` : `rdf:about="${xmlEsc(g.s.v)}"`;
    out += `  <rdf:Description ${idAttr}>\n`;
    for (const t of g.arr){
      const pn = pfxName(t.p.v); if (!pn) continue;
      const [pp, pl] = pn;
      if (t.p.v === rdfType && t.o.t === "iri"){
        out += `    <rdf:type rdf:resource="${xmlEsc(t.o.v)}"/>\n`;
      } else if (t.o.t === "bnode"){
        out += `    <${pp}:${pl} rdf:nodeID="${xmlEsc(t.o.v)}"/>\n`;
      } else if (t.o.t === "iri"){
        out += `    <${pp}:${pl} rdf:resource="${xmlEsc(t.o.v)}"/>\n`;
      } else {
        const attr = t.o.lang ? ` xml:lang="${t.o.lang}"` : (t.o.dt ? ` rdf:datatype="${xmlEsc(t.o.dt)}"` : "");
        out += `    <${pp}:${pl}${attr}>${xmlEsc(t.o.v)}</${pp}:${pl}>\n`;
      }
    }
    out += `  </rdf:Description>\n`;
  }
  out += "</rdf:RDF>\n";
  return out;
}

// ============================================================================
// JSON-LD serialization
// ============================================================================
function toJsonLd(model, opts){
  const { triples } = (opts && opts._triples) ? { triples: opts._triples } : buildTriples(model, opts);
  const ctx = {}; for (const p of ["skos", "skosxl", "rdf", "rdfs", "dcterms", "xsd"]) ctx[p] = NS[p];
  if (model.prefix) ctx[model.prefix] = model.base;
  const _actx = annexNs(model), _dctx = annexNs(model, "doc");
  if (_actx) ctx.agents = _actx;
  if (_dctx && _dctx !== _actx) ctx.resources = _dctx;
  const order = [], groups = new Map();
  for (const t of triples){
    const k = termId(t.s);
    if (!groups.has(k)){ groups.set(k, { s: t.s, arr: [] }); order.push(k); }
    groups.get(k).arr.push(t);
  }
  const compact = uri => { for (const [p, ns] of Object.entries(NS)) if (uri.startsWith(ns)){ const loc = uri.slice(ns.length); if (/^[A-Za-z_][\w.-]*$/.test(loc)) return p + ":" + loc; } return uri; };
  const rdfType = NS.rdf + "type";
  const graph = [];
  for (const k of order){
    const g = groups.get(k), node = { "@id": g.s.t === "bnode" ? "_:" + g.s.v : g.s.v }, props = {};
    for (const t of g.arr){
      if (t.p.v === rdfType){ (node["@type"] = node["@type"] || []).push(compact(t.o.v)); continue; }
      const key = compact(t.p.v);
      let val;
      if (t.o.t === "bnode") val = { "@id": "_:" + t.o.v };
      else if (t.o.t === "iri") val = { "@id": t.o.v };
      else if (t.o.lang) val = { "@value": t.o.v, "@language": t.o.lang };
      else if (t.o.dt) val = { "@value": t.o.v, "@type": compact(t.o.dt) };
      else val = t.o.v;
      (props[key] = props[key] || []).push(val);
    }
    for (const [key, arr] of Object.entries(props)) node[key] = arr.length === 1 ? arr[0] : arr;
    if (node["@type"] && node["@type"].length === 1) node["@type"] = node["@type"][0];
    graph.push(node);
  }
  return JSON.stringify({ "@context": ctx, "@graph": graph }, null, 2);
}

// ============================================================================
// CSV / spreadsheet serialization (one row per concept, flat)
// ============================================================================
function csvCell(s){ s = String(s == null ? "" : s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function modelToGrid(model){
  const cols = ["id","uri","prefLabel","altLabel","hiddenLabel","definition","scopeNote",
    "changeNote","historyNote","editorialNote","example","notation",
    "broader","related","exactMatch","closeMatch","broadMatch","narrowMatch","relatedMatch","artifacts","topConcept"];
  const fmt = arr => (arr || []).map(l => l.lang ? l.val + "@" + l.lang : l.val).join(" | ");
  const fmtArt = arr => (arr || []).map(a => (a.title || "(untitled)") + " [" + (a.type || "link") + "] " + (a.url || "")).join(" | ");
  const ids = model.order && model.order.length ? model.order : Object.keys(model.concepts);
  const grid = [cols];
  for (const id of ids){
    const c = model.concepts[id]; if (!c) continue;
    grid.push([ id, model.base + id, fmt(c.pref), fmt(c.alt), fmt(c.hidden), fmt(c.definition), fmt(c.scopeNote),
      fmt(c.changeNote), fmt(c.historyNote), fmt(c.editorialNote), fmt(c.example),
      c.notation || "", (c.broader || []).join(" | "), (c.related || []).join(" | "),
      (c.exactMatch || []).join(" | "), (c.closeMatch || []).join(" | "), (c.broadMatch || []).join(" | "),
      (c.narrowMatch || []).join(" | "), (c.relatedMatch || []).join(" | "), fmtArt(c.artifacts), c.top ? "yes" : "" ]);
  }
  return grid;
}
function toCsv(model){ return gridToCsv(modelToGrid(model)); }

// ============================================================================
// Spreadsheet import — CSV and Excel (.xlsx) → model. Client-side only, no
// network. Template columns (header row, case-insensitive; underscores/spaces
// ignored): id, prefLabel, altLabel, hiddenLabel, definition, scopeNote,
// notation, broader, narrower, related, exactMatch, closeMatch, broadMatch,
// narrowMatch, relatedMatch, topConcept. One row per concept. Multi-value
// cells are separated by " | "; broader/narrower/related name other rows by
// their id or prefLabel. This round-trips with toCsv().
// ============================================================================
function parseCsvText(text){
  text = String(text).replace(/^﻿/, "");
  const nl = text.search(/\r?\n/);
  const firstLine = text.slice(0, nl >= 0 ? nl : text.length);
  const c = { ",": (firstLine.match(/,/g)||[]).length, ";": (firstLine.match(/;/g)||[]).length, "\t": (firstLine.match(/\t/g)||[]).length };
  const delim = c["\t"] > c[","] && c["\t"] > c[";"] ? "\t" : (c[";"] > c[","] ? ";" : ",");
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (inQ){
      if (ch === '"'){ if (text[i+1] === '"'){ field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim){ row.push(field); field = ""; }
    else if (ch === "\n"){ row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length-1].every(x => String(x).trim() === "")) rows.pop();
  return rows;
}
function gridToCsv(grid){ return grid.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n"; }
function looksLikeCsv(text){
  const head = String(text).slice(0, 400);
  if (/@prefix|@base|<\?xml|<rdf:RDF|"@context"|^\s*[\[{]/.test(head)) return false;
  const first = (String(text).split(/\r?\n/)[0] || "").toLowerCase();
  return /(^|[,;\t])\s*"?\s*(id|uri|preflabel|pref_label|pref label|label|term|name|broader|parent)\s*"?\s*([,;\t]|$)/.test(first);
}
function gridToModel(grid, opts){
  if (!grid || !grid.length) throw new Error("empty spreadsheet");
  const norm = h => String(h).trim().toLowerCase().replace(/[\s_]+/g, "");
  const headers = grid[0].map(norm);
  const alias = {
    id:"id", uri:"uri",
    preflabel:"pref", label:"pref", term:"pref", name:"pref",
    altlabel:"alt", altlabels:"alt", synonym:"alt", synonyms:"alt", alt:"alt",
    hiddenlabel:"hidden", hidden:"hidden",
    definition:"definition", def:"definition", description:"definition",
    scopenote:"scopeNote", scope:"scopeNote", note:"scopeNote",
    changenote:"changeNote", historynote:"historyNote", editorialnote:"editorialNote", example:"example", examples:"example",
    notation:"notation", code:"notation",
    broader:"broader", parent:"broader", broaderterm:"broader", bt:"broader",
    narrower:"narrower", nt:"narrower",
    related:"related", rt:"related",
    exactmatch:"exactMatch", closematch:"closeMatch", broadmatch:"broadMatch",
    narrowmatch:"narrowMatch", relatedmatch:"relatedMatch",
    topconcept:"top", top:"top", istop:"top",
    lang:"lang", language:"lang", languagetag:"lang", "@lang":"lang", locale:"lang"
  };
  const colOf = {};
  headers.forEach((h, i) => { const k = alias[h]; if (k !== undefined && colOf[k] === undefined) colOf[k] = i; });
  if (colOf.pref === undefined && colOf.id === undefined)
    throw new Error("Spreadsheet needs a prefLabel (or id) column. Download the CSV template for the expected columns.");
  const model = newModel();
  model.concepts = {}; model.order = [];
  model.scheme.title = "";   // don't inherit the "My Taxonomy" default — let the importer name it
  // Default language for untagged labels: caller's choice (usually the current
  // scheme's language) → the scheme's own lang → "en". SKOS labels are language-
  // tagged per BCP 47 (ISO 639 language + optional ISO 3166 region / ISO 15924 script).
  const dl = (opts && opts.defaultLang && String(opts.defaultLang).trim()) || model.defaultLang || "en";
  model.defaultLang = dl; if (model.scheme) model.scheme.lang = dl;
  const cell = (r, k) => colOf[k] === undefined ? "" : (r[colOf[k]] !== undefined ? String(r[colOf[k]]) : "");
  const splitText = v => String(v || "").split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  const splitRef  = v => String(v || "").split(/\s*[|;]\s*|\r?\n/).map(s => s.trim()).filter(Boolean);
  // A cell may carry its own BCP-47 tag ("term@nl", "woord@nl-BE", "名@zh-Hans"); otherwise
  // it takes the row's lang column, else the import default.
  const toLit = (v, lg) => { const m = /^(.*?)@([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*)$/.exec(v); return m ? { val: m[1].trim(), lang: m[2] } : { val: v, lang: (lg || dl) }; };
  const slug = s => (String(s||"").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)) || "concept";
  const labelToId = {};
  const pending = [];
  for (let i = 1; i < grid.length; i++){
    const r = grid[i];
    if (!r || r.every(x => String(x).trim() === "")) continue;
    let rawId = cell(r, "id").trim().replace(/[^A-Za-z0-9_.-]/g, "-").replace(/^-+|-+$/g, "");
    const prefVals = splitText(cell(r, "pref"));
    if (!rawId){ const uri = cell(r, "uri").trim(); if (uri) rawId = (uri.split(/[\/#]/).filter(Boolean).pop() || "").replace(/[^A-Za-z0-9_.-]/g, "-"); }
    if (!rawId) rawId = slug(prefVals[0] || "concept");
    const id = uniqueLocalIn(model.concepts, rawId);
    const cpt = emptyConcept(id);
    const rowLang = cell(r, "lang").trim() || dl;   // per-row language override (else the import default)
    prefVals.forEach(v => cpt.pref.push(toLit(v, rowLang)));
    splitText(cell(r, "alt")).forEach(v => cpt.alt.push(toLit(v, rowLang)));
    splitText(cell(r, "hidden")).forEach(v => cpt.hidden.push(toLit(v, rowLang)));
    splitText(cell(r, "definition")).forEach(v => cpt.definition.push(toLit(v, rowLang)));
    splitText(cell(r, "scopeNote")).forEach(v => cpt.scopeNote.push(toLit(v, rowLang)));
    splitText(cell(r, "changeNote")).forEach(v => cpt.changeNote.push(toLit(v, rowLang)));
    splitText(cell(r, "historyNote")).forEach(v => cpt.historyNote.push(toLit(v, rowLang)));
    splitText(cell(r, "editorialNote")).forEach(v => cpt.editorialNote.push(toLit(v, rowLang)));
    splitText(cell(r, "example")).forEach(v => cpt.example.push(toLit(v, rowLang)));
    const nota = cell(r, "notation").trim(); if (nota) cpt.notation = nota;
    ["exactMatch","closeMatch","broadMatch","narrowMatch","relatedMatch"].forEach(k => splitRef(cell(r, k)).forEach(v => cpt[k].push(v)));
    const topv = cell(r, "top").trim().toLowerCase(); if (["yes","y","true","1","x","top"].includes(topv)) cpt.top = true;
    model.concepts[id] = cpt; model.order.push(id);
    (cpt.pref || []).forEach(l => { if (l.val) labelToId[l.val.trim().toLowerCase()] = id; });
    pending.push({ id, b: splitRef(cell(r, "broader")), n: splitRef(cell(r, "narrower")), rel: splitRef(cell(r, "related")) });
  }
  let stubs = 0;
  const resolve = ref => {
    if (model.concepts[ref]) return ref;
    const byLabel = labelToId[ref.trim().toLowerCase()]; if (byLabel) return byLabel;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return null; // an IRI/CURIE, not a local row
    const sid = uniqueLocalIn(model.concepts, slug(ref));
    const sc = emptyConcept(sid); sc.pref.push({ val: ref, lang: dl });
    model.concepts[sid] = sc; model.order.push(sid); labelToId[ref.trim().toLowerCase()] = sid; stubs++;
    return sid;
  };
  for (const p of pending){
    const cpt = model.concepts[p.id];
    for (const ref of p.b){ const pid = resolve(ref); if (pid && pid !== p.id && !cpt.broader.includes(pid)) cpt.broader.push(pid); }
    for (const ref of p.n){ const cid = resolve(ref); if (cid && cid !== p.id){ const ch = model.concepts[cid]; if (ch && !ch.broader.includes(p.id)) ch.broader.push(p.id); } }
    for (const ref of p.rel){ const rid = resolve(ref); if (rid && rid !== p.id && !cpt.related.includes(rid)) cpt.related.push(rid); }
  }
  for (const id of model.order){ const cpt = model.concepts[id]; if (!cpt.broader.length) cpt.top = true; }
  model._importStubs = stubs;
  return model;
}
function csvToModel(text, opts){ return gridToModel(parseCsvText(text), opts); }
// ---- Excel .xlsx: unzip with native DecompressionStream, read the first sheet ----
async function _inflateRaw(bytes){
  if (typeof DecompressionStream === "undefined")
    throw new Error("this browser can't unzip .xlsx — save the sheet as CSV and import that");
  const ds = new DecompressionStream("deflate-raw");
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}
async function _unzip(arrayBuffer){
  const dv = new DataView(arrayBuffer), bytes = new Uint8Array(arrayBuffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--)
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) throw new Error("not a valid .xlsx file (no ZIP directory)");
  const count = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let n = 0; n < count && dv.getUint32(off, true) === 0x02014b50; n++){
    const method = dv.getUint16(off + 10, true), compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true), extraLen = dv.getUint16(off + 30, true), commLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    entries[name] = { method, compSize, localOff };
    off += 46 + nameLen + extraLen + commLen;
  }
  const read = async name => {
    const e = entries[name]; if (!e) return null;
    const lnameLen = dv.getUint16(e.localOff + 26, true), lextraLen = dv.getUint16(e.localOff + 28, true);
    const start = e.localOff + 30 + lnameLen + lextraLen;
    const comp = bytes.subarray(start, start + e.compSize);
    const raw = e.method === 0 ? comp : await _inflateRaw(comp);
    return new TextDecoder("utf-8").decode(raw);
  };
  return { entries, read };
}
async function parseXlsx(arrayBuffer){
  const zip = await _unzip(arrayBuffer), DP = new DOMParser();
  const shared = [];
  const ssXml = await zip.read("xl/sharedStrings.xml");
  if (ssXml){ const doc = DP.parseFromString(ssXml, "application/xml");
    for (const si of doc.getElementsByTagName("si")){ let s = ""; for (const t of si.getElementsByTagName("t")) s += t.textContent; shared.push(s); } }
  let sheetPath = null;
  const wbXml = await zip.read("xl/workbook.xml"), relsXml = await zip.read("xl/_rels/workbook.xml.rels");
  if (wbXml && relsXml){
    const sheet = DP.parseFromString(wbXml, "application/xml").getElementsByTagName("sheet")[0];
    const rid = sheet && (sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    if (rid) for (const rel of DP.parseFromString(relsXml, "application/xml").getElementsByTagName("Relationship"))
      if (rel.getAttribute("Id") === rid){ let t = rel.getAttribute("Target"); sheetPath = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); break; }
  }
  if (!sheetPath || !zip.entries[sheetPath])
    sheetPath = Object.keys(zip.entries).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetPath) throw new Error("no worksheet found in .xlsx");
  const ws = DP.parseFromString(await zip.read(sheetPath), "application/xml");
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref); if (!m) return 0; let n = 0; for (const ch of m[1]) n = n*26 + (ch.charCodeAt(0)-64); return n-1; };
  const grid = [];
  for (const row of ws.getElementsByTagName("row")){
    const cells = [];
    for (const cEl of row.getElementsByTagName("c")){
      const idx = cEl.getAttribute("r") ? colIdx(cEl.getAttribute("r")) : cells.length, t = cEl.getAttribute("t");
      let val = "";
      if (t === "s"){ const v = cEl.getElementsByTagName("v")[0]; val = v ? (shared[parseInt(v.textContent, 10)] || "") : ""; }
      else if (t === "inlineStr"){ const is = cEl.getElementsByTagName("t")[0]; val = is ? is.textContent : ""; }
      else { const v = cEl.getElementsByTagName("v")[0]; val = v ? v.textContent : ""; }
      cells[idx] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    grid.push(cells);
  }
  return grid;
}
// A ready-to-fill CSV template (header + example rows showing hierarchy, a
// synonym, and an external mapping).
function csvTemplate(){
  const cols = ["id","prefLabel","altLabel","hiddenLabel","definition","scopeNote","notation","broader","related","exactMatch","topConcept","lang"];
  const rows = [
    ["","Animals","","","Living creatures in this collection.","","","","","","yes",""],
    ["","Dog","Canine | Hound","","A domesticated canine.","Use for pet dogs, not wild canids.","","Animals","Cat","http://www.wikidata.org/entity/Q144","",""],
    ["","Cat","Feline","","A domesticated feline.","","","Animals","Dog","","",""],
    ["","Puppy","","","A young dog.","","","Dog","","","",""]
  ];
  return [cols.join(",")].concat(rows.map(r => r.map(csvCell).join(","))).join("\r\n") + "\r\n";
}
// ---- Excel .xlsx export: build a ZIP (CRC32 + native CompressionStream) with
// one worksheet using inline strings. No external library. ----
const _crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function _crc32(bytes){ let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function _colName(i){ let s = "", n = i + 1; while (n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
async function _zip(files){
  const deflate = typeof CompressionStream !== "undefined";
  const local = [], central = []; let offset = 0;
  for (const f of files){
    const name = new TextEncoder().encode(f.name), raw = f.data, crc = _crc32(raw);
    let comp = raw, method = 0;
    if (deflate){ const ab = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer(); comp = new Uint8Array(ab); method = 8; }
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true); lh.setUint16(8, method, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    local.push(new Uint8Array(lh.buffer), name, comp);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0, true); cd.setUint16(10, method, true);
    cd.setUint16(12, 0, true); cd.setUint16(14, 0x21, true); cd.setUint32(16, crc, true); cd.setUint32(20, comp.length, true); cd.setUint32(24, raw.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + comp.length;
  }
  let centralSize = 0; for (const c of central) centralSize += c.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true); eocd.setUint32(16, offset, true);
  return new Blob([...local, ...central, new Uint8Array(eocd.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function _xlsxSheet(grid){
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[c]));
  let body = "";
  grid.forEach((row, ri) => {
    let cells = "";
    row.forEach((val, ci) => { if (val === "" || val == null) return; cells += `<c r="${_colName(ci)}${ri+1}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`; });
    body += `<row r="${ri+1}">${cells}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}
async function toXlsx(model){
  const enc = new TextEncoder(), grid = modelToGrid(model);
  const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const WB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Taxonomy" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const WBRELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  return _zip([
    { name: "[Content_Types].xml", data: enc.encode(CT) },
    { name: "_rels/.rels", data: enc.encode(RELS) },
    { name: "xl/workbook.xml", data: enc.encode(WB) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(WBRELS) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(_xlsxSheet(grid)) }
  ]);
}

// ============================================================================
// Markdown — the vocabulary + its linked data as a single readable document.
// Designed for humans to browse and for LLMs to ingest as grounding context.
// ============================================================================
function toMarkdown(model){
  const ids = model.order && model.order.length ? model.order : Object.keys(model.concepts);
  const dl = model.defaultLang || "en";
  const plab = c => { const p=(c.pref||[]).find(l=>l.lang===dl&&l.val)||(c.pref||[]).find(l=>l.val); return p?p.val:(c.id||"(untitled)"); };
  const labelOf = id => { const c=model.concepts[id]; return c?plab(c):id; };
  const litList = arr => (arr||[]).filter(l=>l&&l.val).map(l=> l.lang&&l.lang!==dl ? `${l.val} _(${l.lang})_` : l.val);
  const uriOf = id => (model.base||"") + id;
  // internal-anchor slugs (GitHub-style), de-duplicated so links resolve
  const used={}, anchor={};
  const slug = s => { let a=String(s).toLowerCase().replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-")||"concept"; let b=a,n=1; while(used[a]) a=b+"-"+(++n); used[a]=1; return a; };
  for(const id of ids){ const c=model.concepts[id]; if(c) anchor[id]=slug(plab(c)); }
  const link = id => model.concepts[id] ? `[${labelOf(id)}](#${anchor[id]})` : `\`${id}\``;
  // shorten external IRIs to a friendly CURIE-ish display
  const NSP={"http://dbpedia.org/resource/":"dbr:","http://dbpedia.org/page/":"dbr:","http://www.wikidata.org/entity/":"wd:","http://www.wikidata.org/wiki/":"wd:","http://vocab.getty.edu/aat/":"aat:","http://vocab.getty.edu/tgn/":"tgn:","http://vocab.getty.edu/ulan/":"ulan:","http://id.loc.gov/authorities/subjects/":"lcsh:","http://www.w3.org/2004/02/skos/core#":"skos:"};
  const shortUri = u => { for(const k in NSP) if(u.startsWith(k)) return NSP[k]+u.slice(k.length); const seg=String(u).split(/[#/]/).filter(Boolean).pop(); return seg||u; };
  const extLink = u => `[${shortUri(u)}](${u})`;
  const _hp = c => (c.broader||[]).concat(c.broaderGeneric||[], c.broaderPartitive||[], c.broaderInstantial||[]);
  const childrenOf = id => ids.filter(x=>_hp(model.concepts[x]||{}).includes(id));
  const roots = ids.filter(id=>{ const c=model.concepts[id]; return c && (c.top || !_hp(c).some(b=>model.concepts[b])); });

  const s=model.scheme||{};
  let out = `# ${s.title||"Taxonomy"}\n\n`;
  if(s.description) out += `> ${s.description}\n\n`;
  const meta=[];
  if(s.uri||model.base) meta.push(`**Scheme URI:** \`${s.uri||model.base.replace(/[#/]+$/,"")}\``);
  meta.push(`**Concepts:** ${ids.length}`);
  if(s.creator) meta.push(`**Creator:** ${s.creator}`);
  if(s.publisher) meta.push(`**Publisher:** ${s.publisher}`);
  if(s.created) meta.push(`**Created:** ${s.created}`);
  if(s.rights) meta.push(`**Rights:** ${s.rights}`);
  if(s.lang||dl) meta.push(`**Language:** ${s.lang||dl}`);
  out += meta.join("  \n") + "\n\n";

  // Contents — the hierarchy as a nested outline
  out += `## Contents\n\n`;
  const seen=new Set();
  const outline = (id,depth)=>{ if(seen.has(id))return; seen.add(id);
    out += `${"  ".repeat(depth)}- ${link(id)}\n`;
    childrenOf(id).sort((a,b)=>labelOf(a).localeCompare(labelOf(b))).forEach(k=>outline(k,depth+1)); };
  roots.sort((a,b)=>labelOf(a).localeCompare(labelOf(b))).forEach(r=>outline(r,0));
  // any concepts not reachable from a root (defensive)
  ids.filter(id=>!seen.has(id)).forEach(id=>out+=`- ${link(id)}\n`);
  out += `\n---\n\n## Concepts\n\n`;

  for(const id of ids){ const c=model.concepts[id]; if(!c) continue;
    out += `### ${plab(c)}${c.notation?`  \`${c.notation}\``:""}\n\n`;
    const defs=litList(c.definition); if(defs.length) out += defs.join("\n\n")+"\n\n";
    const scope=litList(c.scopeNote); if(scope.length) out += scope.map(x=>`> ${x}`).join("\n>\n")+"\n\n";
    const rows=[];
    rows.push(`- **URI:** \`${uriOf(id)}\``);
    const alts=litList(c.alt); if(alts.length) rows.push(`- **Also known as:** ${alts.join(", ")}`);
    const hid=litList(c.hidden); if(hid.length) rows.push(`- **Hidden labels:** ${hid.join(", ")}`);
    const br=(c.broader||[]).filter(b=>model.concepts[b]); if(br.length) rows.push(`- **Broader:** ${br.map(link).join(", ")}`);
    const nar=childrenOf(id); if(nar.length) rows.push(`- **Narrower:** ${nar.map(link).join(", ")}`);
    const rel=(c.related||[]).filter(r=>model.concepts[r]); if(rel.length) rows.push(`- **Related:** ${rel.map(link).join(", ")}`);
    // Linked data — mapping properties to other schemes / the open graph
    const maps=[];
    [["exactMatch","exact"],["closeMatch","close"],["broadMatch","broader"],["narrowMatch","narrower"],["relatedMatch","related"]].forEach(([k,disp])=>{
      (c[k]||[]).filter(Boolean).forEach(u=>maps.push(`  - _${disp} match_ → ${extLink(u)}`)); });
    if(maps.length) rows.push(`- **Linked data:**\n`+maps.join("\n"));
    const arts=(c.artifacts||[]).filter(a=>a&&(a.url||a.title)); if(arts.length) rows.push(`- **Resources:**\n`+arts.map(a=>`  - [${a.title||a.url}](${a.url||"#"})${a.type?` _(${a.type})_`:""}`).join("\n"));
    out += rows.join("\n")+"\n\n";
  }
  out += `\n*Generated from a SKOS concept scheme — labels, hierarchy, and linked-data mappings. Exported as Markdown for human review and as grounding context for language models.*\n`;
  return out;
}

// ============================================================================
// RDF/JSON (W3C Working Group Note) — { subject: { predicate: [ objectNode ] } }
// ============================================================================
function toRdfJson(model, opts){
  const tr = buildTriples(model, opts||{}).triples;
  const skey = t => t.t==="bnode" ? "_:"+t.v : t.v;
  const onode = o => {
    const n = { value: o.t==="bnode" ? "_:"+o.v : o.v,
                type: o.t==="iri" ? "uri" : (o.t==="bnode" ? "bnode" : "literal") };
    if(o.t==="lit"){ if(o.lang) n.lang=o.lang; else if(o.dt) n.datatype=o.dt; }
    return n;
  };
  const out = {};
  for(const t of tr){ const s=skey(t.s), p=t.p.v; (out[s]=out[s]||{}); (out[s][p]=out[s][p]||[]).push(onode(t.o)); }
  return JSON.stringify(out, null, 2);
}

// ============================================================================
// Audit-log CSV — one row per recorded change across all terms
// ============================================================================
function toAuditCsv(model){
  const cols = ["datetime", "conceptId", "term", "author", "change"];
  const ids = model.order && model.order.length ? model.order : Object.keys(model.concepts);
  const all = [];
  for (const id of ids){
    const c = model.concepts[id]; if (!c) continue;
    const pl = (c.pref || []).find(l => l.val); const term = pl ? pl.val : id;
    for (const e of (c.history || [])) for (const ch of (e.changes || []))
      all.push({ ts: e.ts || 0, id, term, author: e.author || "", change: ch });
  }
  all.sort((a, b) => a.ts - b.ts);
  const rows = [cols.join(",")];
  for (const r of all){ const dt = isoDateTime(r.ts) || ""; rows.push([dt, r.id, r.term, r.author, r.change].map(csvCell).join(",")); }
  return rows.join("\r\n") + "\r\n";
}

// ============================================================================
// Auto-fixes — mutate model in place, return number of changes applied
// ============================================================================
function autofix(model, kind){
  const C = model.concepts, ids = Object.keys(C);
  let n = 0;
  const dlang = model.defaultLang || "en";
  if (kind === "lang"){
    for (const id of ids){ const c = C[id];
      for (const f of ["pref", "alt", "hidden", "definition", "scopeNote"])
        for (const l of (c[f] || [])) if (l.val && l.val.trim() && !l.lang){ l.lang = dlang; n++; }
    }
  } else if (kind === "selfref"){
    for (const id of ids){ const c = C[id];
      const b = (c.broader || []).filter(x => x !== id); if (b.length !== (c.broader || []).length){ n += (c.broader.length - b.length); c.broader = b; }
      const r = (c.related || []).filter(x => x !== id); if (r.length !== (c.related || []).length){ n += (c.related.length - r.length); c.related = r; }
    }
  } else if (kind === "dangling"){
    for (const id of ids){ const c = C[id];
      const b = (c.broader || []).filter(x => C[x]); n += (c.broader || []).length - b.length; c.broader = b;
      const r = (c.related || []).filter(x => C[x]); n += (c.related || []).length - r.length; c.related = r;
    }
  } else if (kind === "cycle"){
    let guard = 0;
    while (guard++ < 10000){
      const cyc = findCycles(model)[0]; if (!cyc) break;
      const last = cyc[cyc.length - 1], first = cyc[0];
      C[last].broader = (C[last].broader || []).filter(x => x !== first); n++;
    }
  } else if (kind === "redundant"){
    const anc = ancestorsMap(model);
    for (const id of ids){ const c = C[id];
      const direct = (c.broader || []).filter(p => C[p]);
      const remove = new Set();
      for (const p of direct) for (const q of direct) if (q !== p){ const aq = anc.get(q); if (aq && aq.has(p)) remove.add(p); }
      if (remove.size){ c.broader = (c.broader || []).filter(x => !remove.has(x)); n += remove.size; }
    }
  } else if (kind === "topbroader"){
    for (const id of ids){ const c = C[id]; if (c.top && (c.broader || []).length){ c.top = false; n++; } }
  } else if (kind === "unmarkedtop"){
    const HIER = ["broader"].concat(ISO_BROADER);
    for (const id of ids){ const c = C[id];
      if (c.top || HIER.some(f => (c[f] || []).length > 0)) continue;
      const hasNar = ids.some(x => HIER.some(f => (C[x][f] || []).includes(id)));
      if (hasNar || (c.related || []).length){ c.top = true; n++; } }
  } else if (kind === "overlap"){
    for (const id of ids){ const c = C[id];
      const norm = l => (l.val || "").trim().toLowerCase() + "@" + (l.lang || "");
      const prefSet = new Set((c.pref || []).filter(l => l.val).map(norm));
      for (const f of ["alt", "hidden"]){ const before = (c[f] || []).length; c[f] = (c[f] || []).filter(l => !prefSet.has(norm(l))); n += before - c[f].length; }
    }
  }
  return n;
}

// ============================================================================
// qSKOS-inspired validation
// severity: error | warning | info
// ============================================================================
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
function validate(model){
  const R = [];
  const push = (severity, code, title, message, concept) => R.push({ severity, code, title, message, concept });
  const ids = Object.keys(model.concepts);
  const C = model.concepts;

  // label index for ambiguity + overlap
  const prefIndex = new Map(); // "val@lang" -> [ids]
  for (const id of ids){
    const c = C[id];
    // 1 missing prefLabel
    const prefs = (c.pref || []).filter(l => l.val && l.val.trim());
    if (prefs.length === 0) push("error", "missingPrefLabel", "Missing preferred label",
      `Concept has no skos:prefLabel.`, id);

    // 2 multiple prefLabels per language (SKOS S14)
    const byLang = {};
    for (const l of prefs){ const k = l.lang || ""; byLang[k] = (byLang[k] || 0) + 1; }
    for (const [lg, n] of Object.entries(byLang)) if (n > 1)
      push("error", "multiPrefLabel", "Multiple preferred labels per language",
        `${n} skos:prefLabel values tagged "${lg || "(none)"}". SKOS allows only one per language.`, id);

    // 3 language tags + empty labels
    for (const kind of ["pref", "alt", "hidden"]) for (const l of (c[kind] || [])){
      if (!l.val || !l.val.trim()) push("error", "emptyLabel", "Empty label",
        `An empty/whitespace ${kind} label is present.`, id);
      else if (!l.lang) push("warning", "missingLang", "Missing language tag",
        `The ${kind} label "${l.val}" has no language tag.`, id);
      else if (!LANG_RE.test(l.lang)) push("warning", "badLang", "Malformed language tag",
        `Language tag "${l.lang}" on "${l.val}" is not well-formed (BCP-47).`, id);
    }
    for (const kind of ["definition", "scopeNote"]) for (const l of (c[kind] || [])){
      if (l.val && l.val.trim() && !l.lang) push("info", "noteNoLang", "Documentation without language tag",
        `A ${kind} has no language tag.`, id);
    }

    // 4 overlapping labels (pref vs alt/hidden, alt vs hidden) within a concept
    const norm = l => (l.val || "").trim().toLowerCase() + "@" + (l.lang || "");
    const prefSet = new Set(prefs.map(norm));
    for (const l of (c.alt || [])) if (prefSet.has(norm(l)))
      push("warning", "overlapLabel", "Overlapping labels",
        `"${l.val}" is both a preferred and alternative label. SKOS labels should be disjoint.`, id);
    for (const l of (c.hidden || [])) if (prefSet.has(norm(l)))
      push("warning", "overlapLabel", "Overlapping labels",
        `"${l.val}" is both a preferred and hidden label.`, id);

    for (const l of prefs){ const key = norm(l); if (!prefIndex.has(key)) prefIndex.set(key, []); prefIndex.get(key).push(id); }

    // 6 undocumented concepts
    const hasDoc = (c.definition || []).some(l => l.val) || (c.scopeNote || []).some(l => l.val);
    if (!hasDoc) push("info", "undocumented", "Undocumented concept",
      `No skos:definition or skos:scopeNote.`, id);

    // 7 orphan (no hierarchical — plain or ISO 25964 — or associative relations, and not top)
    const _HIER = ["broader"].concat(ISO_BROADER);
    const hasNarrower = ids.some(x => _HIER.some(f => (C[x][f] || []).includes(id)));
    const hasBroaderAny = _HIER.some(f => (c[f] || []).length > 0);
    const isOrphan = !hasBroaderAny && (c.related || []).length === 0 && !hasNarrower && !c.top;
    if (isOrphan) push("warning", "orphan", "Orphan concept",
      `No hierarchical or associative relations and not a top concept — it is disconnected.`, id);

    // 8 unmarked top concept (#54): participates in the vocabulary and acts as a
    // hierarchy root, but isn't declared one — so it exports without
    // skos:topConceptOf and the scheme's entry points are silently incomplete
    if (!hasBroaderAny && !c.top && !isOrphan) push("warning", "unmarkedTop", "Unmarked top concept",
      `No broader term (plain or ISO 25964) and not marked as a top concept — it acts as a hierarchy root but won't export skos:topConceptOf. Mark it top, or give it a parent.`, id);

    // 9 top concept with broader
    if (c.top && (c.broader || []).length)
      push("warning", "topWithBroader", "Top concept has broader",
        `Marked as a top concept but also has skos:broader.`, id);

    // 15 reflexive relations
    if ((c.broader || []).includes(id)) push("error", "selfBroader", "Self-referential hierarchy",
      `Concept is its own skos:broader.`, id);
    if ((c.related || []).includes(id)) push("error", "selfRelated", "Self-referential association",
      `Concept is skos:related to itself.`, id);

    // dangling broader/related targets
    for (const p of (c.broader || [])) if (!C[p]) push("error", "danglingBroader", "Dangling broader",
      `skos:broader points to unknown concept "${p}".`, id);
    for (const r of (c.related || [])) if (!C[r]) push("error", "danglingRelated", "Dangling related",
      `skos:related points to unknown concept "${r}".`, id);

    // mapping targets that are metadata-vocabulary terms, not concepts (#62):
    // skos:*Match aligns concepts with concepts — pointing one at a property or
    // class of DC/FOAF/PROV/RDF(S)/OWL/DCAT/SKOS itself is a modeling slip that
    // only surfaces after publication
    for (const mf of MAP_FIELDS)
      for (const u of (c[mf] || []))
        if (u && Object.values(NS).some(ns => u.startsWith(ns)))
          push("warning", "mappingToVocabTerm", "Mapping targets a vocabulary term",
            `skos:${mf} points at <${u}> — a term of a metadata vocabulary (a property or class), not a skos:Concept. Mappings align concepts with concepts; if this concept is about that term, cite it via a Source or a linked artifact instead.`, id);
  }

  // 5 ambiguous prefLabels (same pref@lang on >1 concept)
  for (const [key, arr] of prefIndex) if (arr.length > 1)
    push("warning", "ambiguousPref", "Ambiguous preferred label",
      `Preferred label "${key}" is shared by ${arr.length} concepts (${arr.join(", ")}).`, arr[0]);

  // 8 cyclic hierarchy (broader)
  const cycles = findCycles(model);
  for (const cyc of cycles) push("error", "cycle", "Cyclic hierarchical relation",
    `broader cycle: ${cyc.join(" → ")} → ${cyc[0]}.`, cyc[0]);

  // 10 relation clash: related pair also connected hierarchically (SKOS S27)
  const anc = ancestorsMap(model);
  for (const id of ids) for (const r of (C[id].related || [])){
    if (!C[r]) continue;
    if ((anc.get(id) && anc.get(id).has(r)) || (anc.get(r) && anc.get(r).has(id)))
      push("error", "relationClash", "Associative/hierarchical clash",
        `${id} and ${r} are skos:related yet also hierarchically connected (violates skos:related disjointness).`, id);
  }

  // 11 hierarchical redundancy (direct broader also a transitive broader via another path)
  for (const id of ids){
    const direct = (C[id].broader || []).filter(p => C[p]);
    for (const p of direct){
      // is p reachable from id through a *different* first step?
      for (const q of direct) if (q !== p){
        const aq = anc.get(q);
        if (aq && aq.has(p)){ push("warning", "redundancy", "Redundant hierarchical relation",
          `broader ${p} is redundant: already reachable via ${q}.`, id); break; }
      }
    }
  }

  // 12 disconnected components (weakly connected over broader/narrower/related)
  const comps = components(model);
  if (comps.length > 1){
    const lbl = id => { const c = model.concepts[id]; const p = c && (c.pref || []).find(l => l.val); return p ? p.val : id; };
    const sorted = comps.slice().sort((a,b)=>b.length-a.length);
    const named = sorted.slice(0,5).map(c => `${c.length} concept${c.length===1?"":"s"} around “${lbl(c[0])}”`);
    const rest = sorted.length > 5 ? ` and ${sorted.length-5} smaller cluster${sorted.length-5===1?"":"s"}` : "";
    push("info", "components", "Disconnected components",
      `Concepts form ${comps.length} separate islands with no broader/narrower/related path between them (counting ISO 25964 relations): ${named.join("; ")}${rest}. One connected vocabulary is usually the goal — islands of size 1 are unlinked concepts. Informational, not an error.`, sorted[1]?.[0]);
  }

  // 14 valueless associative relation (related pair sharing a direct parent)
  for (const id of ids) for (const r of (C[id].related || [])){
    if (!C[r] || r < id) continue;
    const pa = new Set((C[id].broader || [])), shared = (C[r].broader || []).filter(x => pa.has(x));
    if (shared.length) push("info", "valuelessAssoc", "Possibly redundant association",
      `${id} and ${r} are skos:related and share parent ${shared[0]} — the association may be implied by the hierarchy.`, id);
  }

  return R;
}

// Effective hierarchy for validation: plain skos:broader plus the ISO 25964 specialisations
// (they are sub-properties of skos:broader, so a cycle through any of them is still a cycle).
function effBroader(c){ if(!c) return []; const out=[...(c.broader||[])]; for(const f of ISO_BROADER) out.push(...(c[f]||[])); return out; }
function findCycles(model){
  const C = model.concepts, WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {}, stack = [], cycles = [], seen = new Set();
  for (const id in C) color[id] = WHITE;
  function dfs(u){
    color[u] = GRAY; stack.push(u);
    for (const p of effBroader(C[u])){
      if (!C[p]) continue;
      if (color[p] === GRAY){
        const i = stack.indexOf(p);
        const cyc = stack.slice(i);
        const key = [...cyc].sort().join(",");
        if (!seen.has(key)){ seen.add(key); cycles.push(cyc); }
      } else if (color[p] === WHITE) dfs(p);
    }
    stack.pop(); color[u] = BLACK;
  }
  for (const id in C) if (color[id] === WHITE) dfs(id);
  return cycles;
}
function ancestorsMap(model){
  const C = model.concepts, memo = new Map();
  function anc(u, path){
    if (memo.has(u)) return memo.get(u);
    const set = new Set();
    for (const p of effBroader(C[u])){
      if (!C[p] || path.has(p)) continue;
      set.add(p);
      path.add(p); for (const a of anc(p, path)) set.add(a); path.delete(p);
    }
    memo.set(u, set); return set;
  }
  for (const id in C) anc(id, new Set([id]));
  return memo;
}
function components(model){
  const C = model.concepts, ids = Object.keys(C), adj = {};
  for (const id of ids) adj[id] = new Set();
  const HIER = ["broader"].concat(ISO_BROADER);   // ISO 25964 relations are hierarchy too (#52)
  for (const id of ids){
    for (const f of HIER) for (const p of (C[id][f] || [])) if (C[p]){ adj[id].add(p); adj[p].add(id); }
    for (const r of (C[id].related || [])) if (C[r]){ adj[id].add(r); adj[r].add(id); }
  }
  const seen = new Set(), comps = [];
  for (const id of ids){
    if (seen.has(id)) continue;
    const comp = [], stack = [id]; seen.add(id);
    while (stack.length){ const u = stack.pop(); comp.push(u);
      for (const v of adj[u]) if (!seen.has(v)){ seen.add(v); stack.push(v); } }
    comps.push(comp);
  }
  return comps;
}

// ============================================================================
// Turtle importer (tolerant subset: prefixes, ; , lists, lang/dt, skos + skosxl)
// ============================================================================
function parseTurtle(text){ const { triples, prefixes } = parseTriples(text); return triplesToModel(triples, prefixes); }
// RDF/XML importer (subset): rdf:Description and typed node elements; rdf:about / rdf:ID /
// rdf:nodeID subjects; rdf:resource / rdf:nodeID objects; xml:lang, rdf:datatype,
// rdf:parseType="Resource", nested node elements, and xml:base resolution. Namespace-aware
// via DOMParser. Returns the same {triples, prefixes} shape as the Turtle parser.
function parseRdfXml(text){
  const RDF = NS.rdf, XMLNS = "http://www.w3.org/XML/1998/namespace";
  const triples = [], prefixes = {};
  const doc = new DOMParser().parseFromString(text.replace(/^[\s﻿]+/, ""), "application/xml");
  const err = doc.getElementsByTagName("parsererror");
  if (err && err.length) throw new Error("RDF/XML parse error: " + (err[0].textContent || "").replace(/\s+/g, " ").trim().slice(0, 160));
  const root = doc.documentElement;
  if (!root) throw new Error("Empty RDF/XML document");
  const collectNs = el => { const at = el.attributes; if (at) for (let i = 0; i < at.length; i++){ const a = at[i]; if (a.name === "xmlns") prefixes[""] = a.value; else if (a.name.indexOf("xmlns:") === 0) prefixes[a.name.slice(6)] = a.value; } };
  collectNs(root);
  let bn = 0; const newB = () => ({ t: "bnode", v: "_:rx" + (++bn) });
  const abs = (ref, base) => { if (ref == null) return ref; try { return new URL(ref, base || undefined).href; } catch(e){ return ref; } };
  const baseOf = (el, inh) => el.getAttributeNS(XMLNS, "base") || inh || "";
  function nodeElem(el, inh){
    collectNs(el);
    const base = baseOf(el, inh);
    let subj;
    const about = el.getAttributeNS(RDF, "about"), nid = el.getAttributeNS(RDF, "nodeID"), rid = el.getAttributeNS(RDF, "ID");
    if (about != null) subj = { t: "iri", v: abs(about, base) };
    else if (nid != null) subj = { t: "bnode", v: "_:" + nid };
    else if (rid != null) subj = { t: "iri", v: abs("#" + rid, base) };
    else subj = newB();
    if (!(el.namespaceURI === RDF && el.localName === "Description"))
      triples.push({ s: subj, p: { t: "iri", v: RDF + "type" }, o: { t: "iri", v: (el.namespaceURI || "") + el.localName } });
    for (let i = 0; i < el.children.length; i++) propElem(el.children[i], subj, base);
    return subj;
  }
  function propElem(pe, subj, base){
    collectNs(pe);
    const b = baseOf(pe, base);
    const pred = { t: "iri", v: (pe.namespaceURI || "") + pe.localName };
    const res = pe.getAttributeNS(RDF, "resource"), nid = pe.getAttributeNS(RDF, "nodeID"),
          dt = pe.getAttributeNS(RDF, "datatype"), pt = pe.getAttributeNS(RDF, "parseType"),
          lang = pe.getAttributeNS(XMLNS, "lang");
    const kids = pe.children;
    if (res != null){ triples.push({ s: subj, p: pred, o: { t: "iri", v: abs(res, b) } }); return; }
    if (nid != null){ triples.push({ s: subj, p: pred, o: { t: "bnode", v: "_:" + nid } }); return; }
    if (pt === "Resource"){ const o = newB(); triples.push({ s: subj, p: pred, o }); for (let i = 0; i < kids.length; i++) propElem(kids[i], o, b); return; }
    if (kids.length){ for (let i = 0; i < kids.length; i++){ const o = nodeElem(kids[i], b); triples.push({ s: subj, p: pred, o }); } return; }
    const o = { t: "lit", v: pe.textContent != null ? pe.textContent : "" };
    if (lang) o.lang = lang; if (dt) o.dt = dt;
    triples.push({ s: subj, p: pred, o });
  }
  const top = (root.namespaceURI === RDF && root.localName === "RDF") ? Array.from(root.children) : [root];
  const rootBase = baseOf(root, "");
  for (const nd of top) nodeElem(nd, rootBase);
  return { triples, prefixes };
}
function parseTriples(text){
  // RDF/XML is a different syntax — detect it and hand off to the XML parser.
  const _h = text.slice(0, 1200);
  if (/^\s*﻿?\s*<\?xml/i.test(text) || /<rdf:RDF[\s>]/.test(_h) ||
      (/^\s*﻿?\s*</.test(text) && /xmlns:rdf\s*=\s*["']http:\/\/www\.w3\.org\/1999\/02\/22-rdf-syntax-ns#["']/.test(_h)))
    return parseRdfXml(text);
  // tokenizer
  const toks = [];
  let i = 0; const n = text.length;
  const isWs = c => c === " " || c === "\t" || c === "\n" || c === "\r";
  while (i < n){
    const c = text[i];
    if (isWs(c)){ i++; continue; }
    if (c === "#"){ while (i < n && text[i] !== "\n") i++; continue; }
    if (c === "<"){ let j = i + 1; while (j < n && text[j] !== ">") j++; toks.push({ t: "iri", v: text.slice(i + 1, j) }); i = j + 1; continue; }
    if (c === '"' || c === "'"){
      const q = c; let j = i + 1, buf = "";
      // triple-quoted?
      if (text.slice(i, i + 3) === q + q + q){ j = i + 3; let k = j; while (k < n && text.slice(k, k + 3) !== q + q + q){ buf += text[k]; k++; } toks.push({ t: "str", v: buf }); i = k + 3; }
      else { while (j < n && text[j] !== q){ if (text[j] === "\\"){ const e = text[j + 1]; buf += ({ n: "\n", t: "\t", r: "\r", '"': '"', "'": "'", "\\": "\\" })[e] || e; j += 2; } else { buf += text[j]; j++; } } toks.push({ t: "str", v: buf }); i = j + 1; }
      continue;
    }
    if (c === "@"){ let j = i + 1; while (j < n && /[A-Za-z0-9-]/.test(text[j])) j++; toks.push({ t: "at", v: text.slice(i + 1, j) }); i = j; continue; }
    if (text.slice(i, i + 2) === "^^"){ toks.push({ t: "^^" }); i += 2; continue; }
    if (c === "." || c === ";" || c === "," || c === "[" || c === "]" || c === "(" || c === ")"){ toks.push({ t: c }); i++; continue; }
    // pname / a / keyword / number
    let j = i; while (j < n && !isWs(text[j]) && !"#;,.<>\"'()[]".includes(text[j])) j++;
    toks.push({ t: "word", v: text.slice(i, j) }); i = j;
  }

  // parse
  const prefixes = {};
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  function expandPname(w){
    const ci = w.indexOf(":");
    if (ci < 0) return null;
    const pfx = w.slice(0, ci), loc = w.slice(ci + 1);
    if (prefixes[pfx] != null) return prefixes[pfx] + loc;
    return null;
  }
  let _bn = 0;
  function readTerm(){
    const tk = next();
    if (!tk) return null;
    if (tk.t === "iri") return { t: "iri", v: tk.v };
    if (tk.t === "str"){
      let lang = "", dt = "";
      if (peek() && peek().t === "at"){ lang = next().v; }
      else if (peek() && peek().t === "^^"){ next(); const d = next(); dt = d.t === "iri" ? d.v : (expandPname(d.v) || d.v); }
      return { t: "lit", v: tk.v, lang, dt };
    }
    if (tk.t === "word"){
      if (tk.v === "a") return { t: "iri", v: NS.rdf + "type" };
      if (tk.v === "true" || tk.v === "false") return { t: "lit", v: tk.v, dt: NS.xsd + "boolean" };
      if (/^[+-]?\d/.test(tk.v)) return { t: "lit", v: tk.v, dt: NS.xsd + (tk.v.includes(".") ? "decimal" : "integer") };
      const ex = expandPname(tk.v);
      if (ex != null) return { t: "iri", v: ex };
      return { t: "iri", v: tk.v }; // fallback
    }
    if (tk.t === "["){ // blank node property list — parse + emit its triples, keep parser in sync
      const bn = { t: "bnode", v: "_:b" + (++_bn) };
      while (peek() && peek().t !== "]"){
        const pred = readTerm(); if (!pred) break;
        while (true){ const obj = readTerm(); if (!obj) break; triples.push({ s: bn, p: pred, o: obj });
          const d = peek(); if (d && d.t === ","){ next(); continue; } break; }
        const d = peek(); if (d && d.t === ";"){ next(); continue; } break;
      }
      if (peek() && peek().t === "]") next();
      return bn;
    }
    if (tk.t === "("){ // RDF collection ( … ) — consume as an rdf:List
      const items = []; while (peek() && peek().t !== ")"){ const it = readTerm(); if (!it) break; items.push(it); }
      if (peek() && peek().t === ")") next();
      if (!items.length) return { t: "iri", v: NS.rdf + "nil" };
      const head = "_:l" + (++_bn); let cur = head;
      items.forEach((it, idx) => {
        triples.push({ s: { t:"bnode", v:cur }, p:{ t:"iri", v:NS.rdf+"first" }, o: it });
        const rest = idx < items.length - 1 ? "_:l" + (++_bn) : null;
        triples.push({ s:{ t:"bnode", v:cur }, p:{ t:"iri", v:NS.rdf+"rest" }, o: rest ? { t:"bnode", v:rest } : { t:"iri", v:NS.rdf+"nil" } });
        if (rest) cur = rest;
      });
      return { t: "bnode", v: head };
    }
    if (tk.t === "]" || tk.t === ")") return null;
    return { t: "iri", v: "" };
  }

  const triples = [];
  while (p < toks.length){
    const tk = peek();
    if (tk.t === "at" && tk.v.toLowerCase() === "prefix"){
      next(); const pn = next(); const iriTok = next(); next(); // consume '.'
      const name = (pn.v || "").replace(/:$/, "");
      prefixes[name] = iriTok.v; continue;
    }
    if (tk.t === "at" && tk.v.toLowerCase() === "base"){ next(); next(); next(); continue; }
    // SPARQL-style directives (Turtle 1.1): PREFIX / BASE — no leading @, no trailing '.'
    if (tk.t === "word" && tk.v.toUpperCase() === "PREFIX"){
      next(); const pn = next(); const iriTok = next();
      prefixes[(pn && pn.v || "").replace(/:$/, "")] = (iriTok && iriTok.v) || ""; continue;
    }
    if (tk.t === "word" && tk.v.toUpperCase() === "BASE"){ next(); next(); continue; }
    if (tk.t === "."){ next(); continue; }
    // subject
    const subj = readTerm();
    if (!subj) break;
    let guard = 0;
    while (true){
      const pred = readTerm();
      if (!pred) break;
      while (true){
        const obj = readTerm();
        if (!obj) break;
        triples.push({ s: subj, p: pred, o: obj });
        const d = peek();
        if (d && d.t === ","){ next(); continue; }
        break;
      }
      const d = peek();
      if (d && d.t === ";"){ next();
        // allow trailing ; before .
        if (peek() && peek().t === ".") { next(); break; }
        continue; }
      if (d && d.t === "."){ next(); break; }
      if (!d) break;
      if (++guard > 100000) break;
    }
  }

  return { triples, prefixes };
}

function triplesToModel(triples, prefixes){
  const base = guessBase(triples);
  // detect the prefix that maps to the concept base namespace (default "")
  let prefix = "";
  const STD = { skos:1, skosxl:1, rdf:1, rdfs:1, dcterms:1, xsd:1 };
  if (prefixes) for (const [k, v] of Object.entries(prefixes)) if (v === base && !STD[k]){ prefix = k; break; }
  const model = { base, prefix, defaultLang: "en", idStyle: "text",
    scheme: { uri: "", title: "", description: "", creator: "", publisher: "", created: "", issued: "", modified: "", rights: "", license: "", version: "", lang: "en" },
    concepts: {}, order: [], collections: {}, documents: {}, agents: {} };
  const localOf = u => (u.startsWith(base) ? u.slice(base.length) : u);
  // Only genuine SKOS concepts become concepts. An owl:Class/property that merely carries
  // skos annotations (common in OBO/FaBiO ontologies) must NOT be turned into a concept.
  const OWLT=["http://www.w3.org/2002/07/owl#Class","http://www.w3.org/2002/07/owl#ObjectProperty","http://www.w3.org/2002/07/owl#DatatypeProperty","http://www.w3.org/2002/07/owl#AnnotationProperty","http://www.w3.org/2002/07/owl#NamedIndividual","http://www.w3.org/2002/07/owl#Restriction",NS.rdfs+"Class",NS.rdf+"Property"];
  const _typedConcept=new Set(), _typedOnto=new Set();
  for(const t of triples){ if(t.p.t==="iri" && t.p.v===NS.rdf+"type" && t.o.t==="iri"){ if(t.o.v===NS.skos+"Concept") _typedConcept.add(t.s.v); else if(OWLT.includes(t.o.v)) _typedOnto.add(t.s.v); } }
  const _strict=_typedConcept.size>0;   // if the file declares skos:Concepts, treat ONLY those as concepts
  const isConcept = u => _typedConcept.has(u) || (!_strict && !_typedOnto.has(u));
  // Concepts are keyed by a URI→id map so a federated file can hold several
  // namespaces: home-namespace concepts get their local name; foreign concepts get a
  // unique local id AND keep their original URI (c.uri), which the exporter honors.
  const _uriId = {}, _idUri = {}, _maybeForeign = [];
  const ensure = u => { if(!isConcept(u)) return null;
    let id = _uriId[u];
    if (!id){ let bid = localOf(u); if (bid === u) bid = (u.match(/[^#/]+$/) || ["c"])[0] || "c";
      id = bid; let n = 1; while (_idUri[id] && _idUri[id] !== u) id = bid + (++n);
      _uriId[u] = id; _idUri[id] = u; }
    if (!model.concepts[id]){ model.concepts[id] = emptyConcept(id); model.order.push(id);
      if (!u.startsWith(base)) model.concepts[id].uri = u; }   // foreign namespace — preserve identity
    return model.concepts[id]; };
  const idOf = u => _uriId[u] || localOf(u);

  // collect skosxl label literalForms (+ per-label provenance)
  const xlForm = {}; // labelUri -> {v,lang,source}
  for (const t of triples) if (t.p.t === "iri" && t.p.v === NS.skosxl + "literalForm" && t.o.t === "lit")
    (xlForm[t.s.v] = xlForm[t.s.v] || {}), (xlForm[t.s.v].v = t.o.v), (xlForm[t.s.v].lang = t.o.lang);
  for (const t of triples) if (t.p.t === "iri" && t.p.v === NS.dcterms + "source" && t.o.t === "lit" && xlForm[t.s.v])
    xlForm[t.s.v].source = t.o.v;

  const P = NS.skos, X = NS.skosxl, D = NS.dcterms;

  // pre-scan: identify concept URIs and the concept-scheme URI
  const conceptUris = new Set(), dcSubjects = new Set();
  for (const t of triples){
    if (t.p.t !== "iri") continue;
    if (t.p.v === NS.rdf + "type" && t.o.t === "iri"){
      if (t.o.v === P + "Concept") conceptUris.add(t.s.v);
      else if (t.o.v === P + "ConceptScheme" && !model.scheme.uri) model.scheme.uri = t.s.v;   // first scheme is primary; later ones ride as foreign triples
    }
    if (t.p.v.startsWith(D)) dcSubjects.add(t.s.v);
  }
  if (!model.scheme.uri){ // no explicit ConceptScheme: pick a dc-bearing non-concept subject
    for (const s of dcSubjects) if (!conceptUris.has(s)){ model.scheme.uri = s; break; }
  }
  let sawXl = false;
  for (const t of triples){
    if (t.p.t !== "iri") continue;
    const pv = t.p.v, s = t.s.v, o = t.o;
    if (pv === NS.rdf + "type" && o.t === "iri"){
      if (o.v === P + "Concept") ensure(s);
      else if (o.v === P + "ConceptScheme"){ if (!model.scheme.uri) model.scheme.uri = s; else if (s !== model.scheme.uri) _maybeForeign.push(t); }
      continue;
    }
    // scheme metadata
    if (model.scheme.uri && s === model.scheme.uri){
      if (pv === D + "title") model.scheme.title = o.v;
      else if (pv === D + "description") model.scheme.description = o.v;
      else if (pv === D + "creator"){ if (o.t === "iri") model.scheme.creatorAgent = localOf(o.v); else model.scheme.creator = o.v; }
      else if (pv === D + "publisher"){ if (o.t === "iri") model.scheme.publisherAgent = localOf(o.v); else model.scheme.publisher = o.v; }
      else if (pv === D + "contributor" && o.t === "iri"){ (model.scheme.contributorAgents = model.scheme.contributorAgents || []).push(localOf(o.v)); }   // repeatable — collect ALL contributors (was last-wins)
      else if (pv === D + "created") model.scheme.created = dateOnly(o.v);
      else if (pv === D + "issued") model.scheme.issued = dateOnly(o.v);
      else if (pv === D + "modified") model.scheme.modified = dateOnly(o.v);
      else if (pv === D + "language") model.scheme.language = o.v;
      else if (pv === D + "rights") model.scheme.rights = o.v;
      else if (pv === D + "license" && o.t === "iri") model.scheme.license = o.v;
      else if (pv === NS.owl + "versionInfo" && o.t === "lit") model.scheme.version = o.v;
      else if (pv === NS.vann + "preferredNamespacePrefix" && o.t === "lit"){ if (!model.prefix) model.prefix = String(o.v).replace(/[^A-Za-z0-9_-]/g, ""); }
      else if (pv === NS.vann + "preferredNamespaceUri"){ /* consumed — re-emitted from the workspace base */ }
      else if (pv === P + "hasTopConcept" && o.t === "iri"){ const c = ensure(o.v); if(c) c.top = true; }
      else { (model.scheme.extra = model.scheme.extra || []).push({ p: pv, o: { t: o.t, v: o.v, lang: o.lang || "", dt: o.dt || "" } }); }
      continue;
    }
    // concept props (ensure() returns null for non-concepts, so all uses are guarded)
    const addLabel = (field) => { const c = ensure(s); if (c && o.t === "lit") c[field].push({ lang: o.lang || "", val: o.v }); };
    if (pv === P + "prefLabel") addLabel("pref");
    else if (pv === P + "altLabel") addLabel("alt");
    else if (pv === P + "hiddenLabel") addLabel("hidden");
    else if (pv === P + "definition") addLabel("definition");
    else if (pv === P + "scopeNote") addLabel("scopeNote");
    else if (pv === P + "changeNote") addLabel("changeNote");
    else if (pv === P + "historyNote") addLabel("historyNote");
    else if (pv === P + "editorialNote") addLabel("editorialNote");
    else if (pv === P + "example") addLabel("example");
    else if (pv === P + "notation"){ const c = ensure(s); if (c) c.notation = o.v; }
    else if (pv === P + "broader" && o.t === "iri"){ const c = ensure(s), pc = ensure(o.v); if (c && pc){ const pid = idOf(o.v); if (!c.broader.includes(pid)) c.broader.push(pid); } }
    else if (pv === P + "narrower" && o.t === "iri"){ const child = ensure(o.v), par = ensure(s); if (child && par){ const pid = idOf(s); if (!child.broader.includes(pid)) child.broader.push(pid); } }
    else if (pv === P + "related" && o.t === "iri"){ const c = ensure(s), rc = ensure(o.v); if (c && rc){ const rid = idOf(o.v); if (!c.related.includes(rid)) c.related.push(rid); } }
    // ISO 25964 iso-thes specialised hierarchy (+ narrower inverses)
    else if (ISO_BROADER.some(fl => pv === NS.isothes + fl) && o.t === "iri"){ const c = ensure(s), pc = ensure(o.v); if (c && pc){ const fl = pv.slice(NS.isothes.length); const pid = idOf(o.v); (c[fl] = c[fl] || []); if (!c[fl].includes(pid)) c[fl].push(pid); } }
    else if (Object.values(ISO_INVERSE).some(nf => pv === NS.isothes + nf) && o.t === "iri"){ const child = ensure(o.v), par = ensure(s); if (child && par){ const nf = pv.slice(NS.isothes.length); const bf = ISO_BROADER.find(b => ISO_INVERSE[b] === nf); const pid = idOf(s); if (bf){ (child[bf] = child[bf] || []); if (!child[bf].includes(pid)) child[bf].push(pid); } } }
    else if (pv === P + "topConceptOf"){ const c = ensure(s); if (c){ if (!c.uri || (o.t === "iri" && o.v === model.scheme.uri)) c.top = true; else (c.extra = c.extra || []).push({ p: pv, o: { t: o.t, v: o.v, lang: "", dt: "" } }); } }
    else if (MAP_FIELDS.some(m => pv === P + m) && o.t === "iri"){ const c = ensure(s); if (c){ const m = pv.slice(P.length); c[m].push(o.v); } }
    else if (pv === NS.rdfs + "seeAlso" && o.t === "iri"){ const c = ensure(s); if (c){ c.artifacts = c.artifacts || []; c.artifacts.push({ type: "link", title: "", url: o.v }); } }
    else if (pv === NS.rdfs + "label" && o.t === "lit"){ const c = ensure(s); if (c){ (c.rdfsLabel = c.rdfsLabel || []).push({ lang: o.lang || "", val: o.v }); } }
    else if (pv === NS.rdfs + "comment" && o.t === "lit"){ const c = ensure(s); if (c){ (c.comment = c.comment || []).push({ lang: o.lang || "", val: o.v }); } }
    else if (pv === D + "source" && o.t === "iri"){ const c = ensure(s); if (c){ (c.source = c.source || []).push(localOf(o.v)); } }
    // skos-xl
    else if (pv === X + "prefLabel" && o.t === "iri"){ const c = ensure(s), f = xlForm[o.v]; if (c && f){ c.pref.push({ lang: f.lang || "", val: f.v, uri:o.v, source:f.source }); sawXl=true; } }
    else if (pv === X + "altLabel" && o.t === "iri"){ const c = ensure(s), f = xlForm[o.v]; if (c && f){ c.alt.push({ lang: f.lang || "", val: f.v, uri:o.v, source:f.source }); sawXl=true; } }
    else if (pv === X + "hiddenLabel" && o.t === "iri"){ const c = ensure(s), f = xlForm[o.v]; if (c && f){ c.hidden.push({ lang: f.lang || "", val: f.v, uri:o.v, source:f.source }); sawXl=true; } }
    // per-concept Dublin Core metadata → editable fields
    else if (pv === NS.dcterms + "creator"){ const c = ensure(s); if (c) c.creator = o.v; }   // literal or agent URI — both round-trip (#59)
    else if (pv === NS.dcterms + "created" && o.t === "lit"){ const c = ensure(s); if (c) c.created = dateOnly(o.v); }
    else if (pv === NS.dcterms + "issued" && o.t === "lit"){ const c = ensure(s); if (c) c.issued = dateOnly(o.v); }
    else if (pv === NS.dcterms + "modified" && o.t === "lit"){ const c = ensure(s); if (c) c.modified = dateOnly(o.v); }
    // skos:inScheme is re-derived on export (single-scheme editor); consume it here so
    // the passthrough below doesn't duplicate what the exporter already emits.
    else if (pv === P + "inScheme"){ const c = ensure(s);
      // a foreign concept's membership in ITS OWN scheme is data — preserve it;
      // home-namespace membership is re-derived on export as before
      if (c && c.uri && o.t === "iri" && o.v !== model.scheme.uri) (c.extra = c.extra || []).push({ p: pv, o: { t: "iri", v: o.v, lang: "", dt: "" } }); }
    // Passthrough: preserve any predicate on a concept we don't model (per-concept
    // dcterms:created/issued/modified/creator, ISO 25964, custom metadata) so it
    // survives the round-trip and is re-emitted on export.
    else { const c = ensure(s);
      if (c) (c.extra = c.extra || []).push({ p: pv, o: { t: o.t, v: o.v, lang: o.lang || "", dt: o.dt || "" } });
      else if (t.s.t === "iri") _maybeForeign.push(t); }   // non-concept subject (e.g. a second scheme) — candidate for verbatim preservation
  }
  if (sawXl) model.xlLabels = true;
  // De-dup: a plain skos:broader that's entailed by an iso-thes field (per
  // ISO_ENTAILS_SKOS — generic & instantial, not partitive) is redundant, so drop
  // it (keeps round-trips clean). Derived from the same table the exporter asserts.
  for (const id in model.concepts){ const c = model.concepts[id];
    const entailed = new Set();
    for (const f of ISO_BROADER){ if (ISO_ENTAILS_SKOS[f]) for (const p of (c[f] || [])) entailed.add(p); }
    if (entailed.size && c.broader && c.broader.length) c.broader = c.broader.filter(p => !entailed.has(p));
  }
  // A concept with no skos:prefLabel but an rdfs:label: promote the rdfs:label to prefLabel
  // (so it has a skos name) and don't keep it as a duplicate alternate.
  for (const id in model.concepts){ const c = model.concepts[id]; if (!c.pref.length && (c.rdfsLabel||[]).length) c.pref.push(c.rdfsLabel.shift()); }
  // dedupe plain+XL duplicate labels
  for (const id in model.concepts){
    const c = model.concepts[id];
    for (const k of ["pref", "alt", "hidden", "definition", "scopeNote"]){
      const seen = new Set(); c[k] = c[k].filter(l => { const key = l.lang + "" + l.val; if (seen.has(key)) return false; seen.add(key); return true; });
    }
  }
  if (!model.scheme.uri) model.scheme.uri = base.replace(/[#/]$/, "");

  // Default language from the file itself, so new edits aren't silently tagged with the
  // wrong language (dcterms:language if the scheme declares it, else the dominant
  // language among skos:prefLabel literals). BCP-47 tags per SKOS practice.
  (() => {
    let lg = (model.scheme && model.scheme.language ? String(model.scheme.language).trim() : "");
    if (!lg){
      const freq = {}; for (const id in model.concepts) for (const L of (model.concepts[id].pref || [])) if (L.lang){ freq[L.lang] = (freq[L.lang] || 0) + 1; }
      let best = "", max = 0; for (const k in freq) if (freq[k] > max){ max = freq[k]; best = k; }
      lg = best;
    }
    if (lg){ model.defaultLang = lg; if (model.scheme) model.scheme.lang = lg; }
  })();

  // A ConceptScheme titled with skos:prefLabel (or rdfs:label) rather than dcterms:title
  // still fills the title — prefer the default language, else any. (order-independent post-pass)
  if (model.scheme.uri && !model.scheme.title){
    const cand = triples.filter(t => t.s.v === model.scheme.uri && t.o.t === "lit" && t.o.v &&
      t.p.t === "iri" && (t.p.v === NS.skos + "prefLabel" || t.p.v === NS.rdfs + "label"));
    const pick = cand.find(t => t.o.lang === model.defaultLang) || cand[0];
    if (pick){ model.scheme.title = pick.o.v; if (pick.o.lang && !model.scheme.lang) model.scheme.lang = pick.o.lang; }
  }

  // ---- collections: skos:Collection / skos:OrderedCollection ----
  const collTypes = {}; // uri -> ordered?
  for (const t of triples) if (t.p.t==="iri" && t.p.v===NS.rdf+"type" && t.o.t==="iri"){
    if (t.o.v===P+"Collection") collTypes[t.s.v] = collTypes[t.s.v] || false;
    else if (t.o.v===P+"OrderedCollection") collTypes[t.s.v] = true;
  }
  if (Object.keys(collTypes).length){
    // index rdf:List nodes (bnodes) → {first, rest}
    const first = {}, rest = {};
    for (const t of triples){ if (t.p.t!=="iri") continue;
      if (t.p.v===NS.rdf+"first") first[termId(t.s)] = t.o;
      else if (t.p.v===NS.rdf+"rest") rest[termId(t.s)] = t.o;
    }
    const walkList = head => { const out=[]; let cur=head, guard=0; while(cur && !(cur.t==="iri"&&cur.v===NS.rdf+"nil") && guard++<100000){ const k=termId(cur); const f=first[k]; if(f&&f.t==="iri") out.push(idOf(f.v)); cur=rest[k]; } return out; };
    const collLocals = new Set(Object.keys(collTypes).map(localOf));   // members may be sub-collections
    const isMember = m => model.concepts[m] || collLocals.has(m);
    for (const uri in collTypes){
      const cid = localOf(uri);
      const col = { id:cid, label:[], note:[], ordered:!!collTypes[uri], members:[] };
      const memberList = triples.find(t => t.p.t==="iri" && t.s.v===uri && t.p.v===P+"memberList");
      const orderedMembers = memberList ? walkList(memberList.o) : null;
      for (const t of triples){ if (t.p.t!=="iri" || t.s.v!==uri) continue;
        if (t.p.v===NS.rdfs+"label" && t.o.t==="lit") col.label.push({lang:t.o.lang||"", val:t.o.v});
        else if ((t.p.v===P+"prefLabel" || t.p.v===P+"altLabel") && t.o.t==="lit") col.label.push({lang:t.o.lang||"", val:t.o.v});
        else if (t.p.v===P+"note" && t.o.t==="lit") col.note.push({lang:t.o.lang||"", val:t.o.v});
        else if (t.p.v===NS.dcterms+"created" && t.o.t==="lit") col.created = dateOnly(t.o.v);
        else if (t.p.v===NS.dcterms+"modified" && t.o.t==="lit") col.modified = dateOnly(t.o.v);
        else if (t.p.v===P+"member" && t.o.t==="iri"){ const m=idOf(t.o.v); if(isMember(m) && col.members.indexOf(m)<0) col.members.push(m); }
      }
      if (orderedMembers && orderedMembers.length){ col.members = orderedMembers.filter(isMember); }
      model.collections[cid] = col;
    }
  }

  // ---- foaf:Document sources ----
  const docSubs = {};
  for (const t of triples) if (t.p.t==="iri" && t.p.v===NS.rdf+"type" && t.o.t==="iri" && t.o.v===NS.foaf+"Document") docSubs[t.s.v]=true;
  if (Object.keys(docSubs).length){
    model.documents = model.documents || {};
    for (const uri in docSubs){ const id=localOf(uri); const d={ id, title:[], page:[], comment:[] };
      // keep an external subject URI for lossless re-export — unless it is simply the
      // workspace's own annex namespace, which re-derives from agentsBase (#57)
      if (model.base && uri.indexOf(model.base)!==0 && uri!==annexUri(model, null, id, "doc")) d.uri=uri;
      for (const t of triples){ if (t.s.v!==uri || t.p.t!=="iri") continue;
        if (t.p.v===NS.dcterms+"title" && t.o.t==="lit") d.title.push({ lang:t.o.lang||"", val:t.o.v });
        else if (t.p.v===NS.foaf+"page" && t.o.t==="iri") d.page.push(t.o.v);
        else if (t.p.v===NS.rdfs+"comment" && t.o.t==="lit") d.comment.push({ lang:t.o.lang||"", val:t.o.v });
      }
      model.documents[id]=d;
    }
  }

  // ---- prov:Agent (Person / Organization / SoftwareAgent) ----
  const _clsKind = { Person:"person", Organization:"organization", SoftwareAgent:"software" };
  const agentSubs = {};
  for (const t of triples) if (t.p.t==="iri" && t.p.v===NS.rdf+"type" && t.o.t==="iri" && t.o.v.indexOf(NS.prov)===0){ const cls=t.o.v.slice(NS.prov.length); if (_clsKind[cls]) agentSubs[t.s.v]=_clsKind[cls]; }
  if (Object.keys(agentSubs).length){
    model.agents = model.agents || {};
    for (const uri in agentSubs){ const id=localOf(uri); const a={ id, kind:agentSubs[uri], name:"", homepage:"" };
      // keep an external identity URI (e.g. ORCID) — unless it is simply the workspace's
      // own annex namespace, which re-derives from agentsBase (#57)
      if (model.base && uri.indexOf(model.base)!==0 && uri!==annexUri(model, null, id)) a.uri=uri;
      for (const t of triples){ if (t.s.v!==uri || t.p.t!=="iri") continue;
        if (t.p.v===NS.foaf+"name" && t.o.t==="lit") a.name=t.o.v;
        else if (t.p.v===NS.foaf+"homepage" && t.o.t==="iri") a.homepage=t.o.v;
      }
      model.agents[id]=a;
    }
  }
  // multi-namespace fidelity: triples about subjects nothing above consumed (a second
  // ConceptScheme from a federated file, external resources) are preserved verbatim
  // and re-emitted on export.
  const _consumed = u => u === model.scheme.uri || _uriId[u] || xlForm[u] || docSubs[u] || agentSubs[u] || (collTypes[u] !== undefined);
  const _mf = _maybeForeign.filter(t => t.s.t === "iri" && !_consumed(t.s.v));
  if (_mf.length) model.foreign = _mf.map(t => ({ s:{t:"iri",v:t.s.v}, p:{t:t.p.t,v:t.p.v}, o:{t:t.o.t,v:t.o.v,lang:t.o.lang||"",dt:t.o.dt||""} }));
  return model;
}
function guessBase(triples){
  // most common namespace among concept subjects
  const count = {};
  for (const t of triples){
    if (t.p.t === "iri" && t.p.v === NS.rdf + "type" && t.o.t === "iri" && t.o.v === NS.skos + "Concept"){
      const u = t.s.v; const m = u.match(/^(.*[#/])[^#/]+$/); if (m) count[m[1]] = (count[m[1]] || 0) + 1;
    }
  }
  let best = "http://example.org/taxonomy#", max = 0;
  for (const [k, v] of Object.entries(count)) if (v > max){ max = v; best = k; }
  return best;
}

// ============================================================================
// SPARQL SELECT engine (pragmatic subset)
// ============================================================================
function sparql(query, triples, opts){
  opts = opts || {};
  const P = new SparqlParser(query, opts.base);
  const q = P.parse();
  const store = indexTriples(triples);
  let rows = evalGroup(q.where, [{}], store);
  // aggregates / grouping
  if (q.agg){
    rows = aggregate(rows, q);
  } else {
    if (q.distinct) rows = distinctRows(rows, q.vars);
  }
  // order
  if (q.order.length) rows.sort((a, b) => cmpRows(a, b, q.order));
  // projection
  let out = rows.map(r => {
    const o = {}; for (const v of q.vars) o[v] = r[v] != null ? r[v] : null; return o;
  });
  if (q.distinct && !q.agg) out = distinctProjected(out, q.vars);
  const off = q.offset || 0;
  if (off) out = out.slice(off);
  if (q.limit != null) out = out.slice(0, q.limit);
  return { vars: q.vars, rows: out };
}

function indexTriples(triples){
  const byP = new Map(), spo = [];
  for (const t of triples){
    const tr = { s: t.s, p: t.p.v, o: t.o };
    spo.push(tr);
    if (!byP.has(t.p.v)) byP.set(t.p.v, []);
    byP.get(t.p.v).push(tr);
  }
  return { byP, spo };
}

class SparqlParser{
  constructor(str, base){ this.s = str; this.prefixes = Object.assign({}, NS); if (base) this.prefixes[""] = base; this.toks = this.tokenize(str); this.i = 0; }
  tokenize(str){
    const out = []; let i = 0; const n = str.length;
    const ws = c => /\s/.test(c);
    while (i < n){
      const c = str[i];
      if (ws(c)){ i++; continue; }
      if (c === "#"){ while (i < n && str[i] !== "\n") i++; continue; }
      if (c === "<"){ let j = i + 1; while (j < n && str[j] !== ">") j++; out.push({ t: "iri", v: str.slice(i + 1, j) }); i = j + 1; continue; }
      if (c === '"' || c === "'"){ const q = c; let j = i + 1, buf = ""; while (j < n && str[j] !== q){ if (str[j] === "\\"){ buf += ({ n:"\n",t:"\t",r:"\r" }[str[j+1]]||str[j+1]); j += 2; } else { buf += str[j]; j++; } } let lang = "", dt = ""; j++; if (str[j] === "@"){ let k = j + 1; while (k < n && /[A-Za-z0-9-]/.test(str[k])) k++; lang = str.slice(j + 1, k); j = k; } else if (str.slice(j, j + 2) === "^^"){ j += 2; if (str[j] === "<"){ let k = j + 1; while (k < n && str[k] !== ">") k++; dt = str.slice(j + 1, k); j = k + 1; } else { let k = j; while (k < n && !ws(str[k]) && !"{}().;,".includes(str[k])) k++; dt = str.slice(j, k); j = k; } } out.push({ t: "str", v: buf, lang, dt }); i = j; continue; }
      if (c === "?" || c === "$"){ let j = i + 1; while (j < n && /[\w]/.test(str[j])) j++; out.push({ t: "var", v: str.slice(i + 1, j) }); i = j; continue; }
      if ("{}().;,".includes(c)){ out.push({ t: c }); i++; continue; }
      if (c === "*" ){ out.push({ t: "op", v: "*" }); i++; continue; }
      if ("=!<>&|+-".includes(c)){ let two = str.slice(i, i + 2); if (["!=","<=",">=","&&","||"].includes(two)){ out.push({ t: "op", v: two }); i += 2; } else { out.push({ t: "op", v: c }); i++; } continue; }
      // word (keyword / pname / a / number / path). Exclude path/arith ops so they tokenize separately.
      let j = i; while (j < n && !ws(str[j]) && !"{}().;,<>\"'?$=!&|+*".includes(str[j])) j++;
      out.push({ t: "word", v: str.slice(i, j) }); i = j;
    }
    return out;
  }
  peek(k){ return this.toks[this.i + (k || 0)]; }
  next(){ return this.toks[this.i++]; }
  expectWord(w){ const t = this.next(); if (!t || t.t !== "word" || t.v.toUpperCase() !== w) throw new Error(`Expected ${w}`); }
  isWord(w){ const t = this.peek(); return t && t.t === "word" && t.v.toUpperCase() === w; }

  parse(){
    const q = { vars: [], distinct: false, where: [], order: [], limit: null, offset: 0, agg: null, groupBy: [] };
    // prefixes
    while (this.isWord("PREFIX")){ this.next(); const pn = this.next(); const ir = this.next(); this.prefixes[(pn.v || "").replace(/:$/, "")] = ir.v; }
    this.expectWord("SELECT");
    if (this.isWord("DISTINCT")){ this.next(); q.distinct = true; }
    // projection
    if (this.peek() && this.peek().t === "op" && this.peek().v === "*"){ this.next(); q.star = true; }
    else {
      while (this.peek() && (this.peek().t === "var" || (this.peek().t === "(" ))){
        if (this.peek().t === "("){ // aggregate (COUNT(...) AS ?v)
          this.next(); const fn = this.next().v.toUpperCase();
          this.next(); // (
          let inner = null, distinct = false;
          if (this.isWord("DISTINCT")){ this.next(); distinct = true; }
          if (this.peek().t === "op" && this.peek().v === "*"){ this.next(); inner = "*"; }
          else if (this.peek().t === "var"){ inner = this.next().v; }
          this.next(); // ) closing the aggregate function
          this.expectWord("AS"); const outv = this.next().v;
          if (this.peek() && this.peek().t === ")") this.next(); // ) closing the projection expr
          q.agg = q.agg || []; q.agg.push({ fn, inner, distinct, out: outv });
          q.vars.push(outv);
        } else { q.vars.push(this.next().v); }
      }
    }
    this.expectWord("WHERE");
    q.where = this.parseGroup();
    // modifiers
    while (this.peek()){
      if (this.isWord("ORDER")){ this.next(); this.expectWord("BY"); while (this.peek() && (this.peek().t === "var" || this.isWord("ASC") || this.isWord("DESC"))){ let dir = "asc"; if (this.isWord("ASC")){ this.next(); this.next(); /*(*/ } if (this.isWord("DESC")){ this.next(); dir = "desc"; } let v; if (this.peek().t === "("){ this.next(); v = this.next().v; this.next(); } else v = this.next().v; q.order.push({ v, dir }); } }
      else if (this.isWord("GROUP")){ this.next(); this.expectWord("BY"); while (this.peek() && this.peek().t === "var") q.groupBy.push(this.next().v); }
      else if (this.isWord("LIMIT")){ this.next(); q.limit = parseInt(this.next().v, 10); }
      else if (this.isWord("OFFSET")){ this.next(); q.offset = parseInt(this.next().v, 10); }
      else break;
    }
    if (q.star){ q.vars = collectVars(q.where); }
    return q;
  }

  parseGroup(){
    const t = this.next(); if (!t || t.t !== "{") throw new Error("Expected {");
    const items = [];
    while (this.peek() && this.peek().t !== "}"){
      if (this.isWord("OPTIONAL")){ this.next(); const g = this.parseGroup(); items.push({ type: "optional", patterns: g }); continue; }
      if (this.isWord("FILTER")){ this.next(); const e = this.parseFilter(); items.push({ type: "filter", expr: e }); continue; }
      if (this.peek().t === "{"){ const g = this.parseGroup(); items.push({ type: "group", patterns: g }); continue; }
      // triple pattern block: subject ... ; ... .
      this.parseTriples(items);
    }
    this.next(); // }
    return items;
  }
  parseTriples(items){
    const subj = this.parseTerm();
    while (true){
      const pred = this.parsePredicate();
      while (true){
        const obj = this.parseTerm();
        items.push({ type: "triple", s: subj, p: pred, o: obj });
        if (this.peek() && this.peek().t === ","){ this.next(); continue; }
        break;
      }
      const d = this.peek();
      if (d && d.t === ";"){ this.next(); if (this.peek() && (this.peek().t === "}" || this.peek().t === ".")){ if (this.peek().t === ".") this.next(); break; } continue; }
      if (d && d.t === "."){ this.next(); break; }
      break;
    }
  }
  parsePredicate(){
    // predicate with optional path op + or *
    const t = this.peek();
    if (t.t === "word" && t.v === "a"){ this.next(); return { term: { t: "iri", v: NS.rdf + "type" }, path: null }; }
    const term = this.parseTerm();
    let path = null;
    const nx = this.peek();
    if (nx && nx.t === "op" && (nx.v === "*")){ this.next(); path = "*"; }
    else if (nx && nx.t === "word" && (nx.v === "+" )){ this.next(); path = "+"; }
    // handle '+' captured as op
    else if (nx && nx.t === "op" && nx.v === "+"){ this.next(); path = "+"; }
    return { term, path };
  }
  parseTerm(){
    const t = this.next();
    if (t.t === "var") return { t: "var", v: t.v };
    if (t.t === "iri") return { t: "iri", v: t.v };
    if (t.t === "str") return { t: "lit", v: t.v, lang: t.lang || "", dt: t.dt || "" };
    if (t.t === "word"){
      if (t.v === "a") return { t: "iri", v: NS.rdf + "type" };
      if (/^[+-]?\d/.test(t.v)) return { t: "lit", v: t.v, dt: NS.xsd + (t.v.includes(".") ? "decimal" : "integer") };
      const ex = this.expand(t.v); return { t: "iri", v: ex };
    }
    throw new Error("Unexpected token in term: " + JSON.stringify(t));
  }
  expand(w){ const ci = w.indexOf(":"); if (ci < 0) return w; const pfx = w.slice(0, ci), loc = w.slice(ci + 1); if (this.prefixes[pfx] != null) return this.prefixes[pfx] + loc; return w; }

  // ---- FILTER expression (recursive descent) ----
  parseFilter(){
    // FILTER ( expr )  or FILTER regex(...)
    let wrapped = false;
    if (this.peek() && this.peek().t === "("){ this.next(); wrapped = true; }
    const e = this.parseOr();
    if (wrapped){ if (this.peek() && this.peek().t === ")") this.next(); }
    return e;
  }
  parseOr(){ let l = this.parseAnd(); while (this.peek() && this.peek().t === "op" && this.peek().v === "||"){ this.next(); l = { op: "||", l, r: this.parseAnd() }; } return l; }
  parseAnd(){ let l = this.parseCmp(); while (this.peek() && this.peek().t === "op" && this.peek().v === "&&"){ this.next(); l = { op: "&&", l, r: this.parseCmp() }; } return l; }
  parseCmp(){ let l = this.parseUnary(); const t = this.peek(); if (t && t.t === "op" && ["=","!=","<",">","<=",">="].includes(t.v)){ this.next(); return { op: t.v, l, r: this.parseUnary() }; } return l; }
  parseUnary(){ const t = this.peek(); if (t && t.t === "op" && t.v === "!"){ this.next(); return { op: "!", e: this.parseUnary() }; } return this.parseAtom(); }
  parseAtom(){
    const t = this.peek();
    if (t.t === "("){ this.next(); const e = this.parseOr(); if (this.peek() && this.peek().t === ")") this.next(); return e; }
    if (t.t === "var"){ this.next(); return { term: { t: "var", v: t.v } }; }
    if (t.t === "iri"){ this.next(); return { term: { t: "iri", v: t.v } }; }
    if (t.t === "str"){ this.next(); return { term: { t: "lit", v: t.v, lang: t.lang || "", dt: t.dt || "" } }; }
    if (t.t === "word"){
      const w = t.v.toUpperCase();
      const fns = ["REGEX","CONTAINS","STRSTARTS","STRENDS","LANG","STR","BOUND","LCASE","UCASE","ISIRI","ISLITERAL","DATATYPE","STRLEN"];
      if (fns.includes(w)){
        this.next(); this.next(); // fn (
        const args = [];
        if (this.peek() && this.peek().t !== ")"){ args.push(this.parseOr()); while (this.peek() && this.peek().t === ","){ this.next(); args.push(this.parseOr()); } }
        if (this.peek() && this.peek().t === ")") this.next();
        return { fn: w, args };
      }
      if (/^[+-]?\d/.test(t.v)){ this.next(); return { term: { t: "lit", v: t.v, dt: NS.xsd + "double" } }; }
      // prefixed name
      this.next(); return { term: { t: "iri", v: this.expand(t.v) } };
    }
    throw new Error("Bad filter atom: " + JSON.stringify(t));
  }
}

// ---- evaluation ----
function matchTerm(pat, val, b){
  if (pat.t === "var"){ if (b[pat.v] !== undefined){ return termId(b[pat.v]) === termId(val); } b = Object.assign({}, b); b[pat.v] = val; return b; }
  return termId(pat) === termId(val) ? b : false;
}
function evalGroup(items, bindings, store){
  let cur = bindings;
  // triples + filters + optionals in order; simple left-to-right join
  for (const it of items){
    if (it.type === "triple") cur = joinTriple(cur, it, store);
    else if (it.type === "filter") cur = cur.filter(b => evalExpr(it.expr, b));
    else if (it.type === "optional"){
      const out = [];
      for (const b of cur){ const sub = evalGroup(it.patterns, [b], store); if (sub.length) out.push(...sub); else out.push(b); }
      cur = out;
    } else if (it.type === "group"){ cur = evalGroup(it.patterns, cur, store); }
  }
  return cur;
}
function joinTriple(bindings, pat, store){
  const out = [];
  const path = pat.p.path;
  if (path){ // transitive over a single predicate
    const pred = pat.p.term.v;
    for (const b of bindings){
      const pairs = pathPairs(store, pred, path);
      for (const [s, o] of pairs){
        let b1 = matchTerm(pat.s, s, b); if (b1 === false) continue;
        let b2 = matchTerm(pat.o, o, b1); if (b2 === false) continue;
        out.push(b2);
      }
    }
    return out;
  }
  const predIri = pat.p.term ? pat.p.term.v : pat.p.v;
  const cand = store.byP.get(predIri) || [];
  for (const b of bindings){
    for (const tr of cand){
      let b1 = matchTerm(pat.s, tr.s, b); if (b1 === false) continue;
      let b2 = matchTerm(pat.o, tr.o, b1); if (b2 === false) continue;
      out.push(b2);
    }
  }
  return out;
}
const _pathCache = new WeakMap();
function pathPairs(store, pred, op){
  // reachability pairs over predicate pred
  const adj = new Map(); const nodes = new Set();
  for (const tr of (store.byP.get(pred) || [])){
    const a = termId(tr.s), bId = termId(tr.o);
    nodes.add(a); nodes.add(bId);
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push([bId, tr.o]); if (!store._id2term) store._id2term = new Map();
    store._id2term.set(a, tr.s); store._id2term.set(bId, tr.o);
  }
  const pairs = [];
  for (const start of nodes){
    const seen = new Set([start]); const stack = [start];
    while (stack.length){ const u = stack.pop(); for (const [vId, vt] of (adj.get(u) || [])){ if (!seen.has(vId)){ seen.add(vId); stack.push(vId); pairs.push([store._id2term.get(start), vt]); } } }
    if (op === "*") pairs.push([store._id2term.get(start), store._id2term.get(start)]);
  }
  return pairs;
}
function evalExpr(e, b){
  const v = evalVal(e, b);
  return toBool(v);
}
function toBool(v){ if (v == null) return false; if (v.t === "lit"){ if (v.dt && v.dt.endsWith("boolean")) return v.v === "true"; return v.v !== ""; } return true; }
function num(v){ return v && v.t === "lit" ? parseFloat(v.v) : NaN; }
function evalVal(e, b){
  if (!e) return null;
  if (e.term){ const t = e.term; if (t.t === "var") return b[t.v] != null ? b[t.v] : null; return t; }
  if (e.op){
    if (e.op === "!") return lit(toBool(evalVal(e.e, b)) ? "false" : "true", "", NS.xsd + "boolean");
    if (e.op === "||") return lit((toBool(evalVal(e.l, b)) || toBool(evalVal(e.r, b))) ? "true" : "false", "", NS.xsd + "boolean");
    if (e.op === "&&") return lit((toBool(evalVal(e.l, b)) && toBool(evalVal(e.r, b))) ? "true" : "false", "", NS.xsd + "boolean");
    const L = evalVal(e.l, b), R = evalVal(e.r, b);
    const bool = x => lit(x ? "true" : "false", "", NS.xsd + "boolean");
    if (L == null || R == null) return bool(false);
    const isNum = L.t === "lit" && R.t === "lit" && !isNaN(num(L)) && !isNaN(num(R)) && (L.dt || "").match(/integer|decimal|double|float|int/) ;
    let lv, rv;
    if (isNum){ lv = num(L); rv = num(R); } else { lv = L.t === "iri" ? L.v : L.v; rv = R.t === "iri" ? R.v : R.v; }
    switch (e.op){
      case "=": return bool(L.t === R.t && (L.t === "iri" ? L.v === R.v : (L.v === R.v)));
      case "!=": return bool(!(L.t === R.t && (L.t === "iri" ? L.v === R.v : (L.v === R.v))));
      case "<": return bool(lv < rv); case ">": return bool(lv > rv);
      case "<=": return bool(lv <= rv); case ">=": return bool(lv >= rv);
    }
  }
  if (e.fn){
    const a = e.args.map(x => evalVal(x, b));
    const sv = x => x == null ? "" : x.v;
    switch (e.fn){
      case "REGEX": { const flags = a[2] ? sv(a[2]) : ""; try { return lit(new RegExp(sv(a[1]), flags).test(sv(a[0])) ? "true" : "false", "", NS.xsd + "boolean"); } catch (_) { return lit("false"); } }
      case "CONTAINS": return lit(sv(a[0]).includes(sv(a[1])) ? "true" : "false", "", NS.xsd + "boolean");
      case "STRSTARTS": return lit(sv(a[0]).startsWith(sv(a[1])) ? "true" : "false", "", NS.xsd + "boolean");
      case "STRENDS": return lit(sv(a[0]).endsWith(sv(a[1])) ? "true" : "false", "", NS.xsd + "boolean");
      case "LANG": return lit(a[0] && a[0].t === "lit" ? (a[0].lang || "") : "");
      case "STR": return lit(sv(a[0]));
      case "LCASE": return lit(sv(a[0]).toLowerCase());
      case "UCASE": return lit(sv(a[0]).toUpperCase());
      case "STRLEN": return lit(String(sv(a[0]).length), "", NS.xsd + "integer");
      case "BOUND": return lit(a[0] != null ? "true" : "false", "", NS.xsd + "boolean");
      case "ISIRI": return lit(a[0] && a[0].t === "iri" ? "true" : "false", "", NS.xsd + "boolean");
      case "ISLITERAL": return lit(a[0] && a[0].t === "lit" ? "true" : "false", "", NS.xsd + "boolean");
      case "DATATYPE": return iri(a[0] && a[0].t === "lit" ? (a[0].dt || NS.xsd + "string") : NS.xsd + "string");
    }
  }
  return null;
}
function distinctRows(rows, vars){
  const seen = new Set(), out = [];
  for (const r of rows){ const k = vars.map(v => r[v] ? termId(r[v]) : "").join(""); if (!seen.has(k)){ seen.add(k); out.push(r); } }
  return out;
}
function distinctProjected(rows, vars){
  const seen = new Set(), out = [];
  for (const r of rows){ const k = vars.map(v => r[v] ? termId(r[v]) : "").join(""); if (!seen.has(k)){ seen.add(k); out.push(r); } }
  return out;
}
function aggregate(rows, q){
  const groupVars = q.groupBy.length ? q.groupBy : q.vars.filter(v => !q.agg.some(a => a.out === v));
  const groups = new Map();
  for (const r of rows){
    const key = groupVars.map(v => r[v] ? termId(r[v]) : "").join("");
    if (!groups.has(key)) groups.set(key, { rep: r, rows: [] });
    groups.get(key).rows.push(r);
  }
  // implicit single group: an aggregate with no GROUP BY over 0 rows still yields one row
  if (groups.size === 0 && groupVars.length === 0) groups.set("", { rep: {}, rows: [] });
  const out = [];
  for (const g of groups.values()){
    const o = {}; for (const v of groupVars) o[v] = g.rep[v] != null ? g.rep[v] : null;
    for (const a of q.agg){
      let val;
      if (a.fn === "COUNT"){
        if (a.inner === "*") val = g.rows.length;
        else { let vals = g.rows.map(r => r[a.inner]).filter(x => x != null); if (a.distinct){ const s = new Set(vals.map(termId)); val = s.size; } else val = vals.length; }
      } else if (a.fn === "SUM"){ val = g.rows.reduce((s, r) => s + (r[a.inner] ? num(r[a.inner]) : 0), 0); }
      else if (a.fn === "MAX"){ val = Math.max(...g.rows.map(r => r[a.inner] ? num(r[a.inner]) : -Infinity)); }
      else if (a.fn === "MIN"){ val = Math.min(...g.rows.map(r => r[a.inner] ? num(r[a.inner]) : Infinity)); }
      else val = g.rows.length;
      o[a.out] = lit(String(val), "", NS.xsd + "integer");
    }
    out.push(o);
  }
  return out;
}
function cmpRows(a, b, order){
  for (const { v, dir } of order){
    const x = a[v], y = b[v];
    const xs = x ? (x.t === "iri" ? x.v : x.v) : "";
    const ys = y ? (y.t === "iri" ? y.v : y.v) : "";
    const nx = parseFloat(xs), ny = parseFloat(ys);
    let c;
    if (!isNaN(nx) && !isNaN(ny) && String(nx) === xs && String(ny) === ys) c = nx - ny;
    else c = xs < ys ? -1 : xs > ys ? 1 : 0;
    if (c !== 0) return dir === "desc" ? -c : c;
  }
  return 0;
}
function collectVars(items){
  const set = [];
  const add = v => { if (!set.includes(v)) set.push(v); };
  const walk = arr => { for (const it of arr){ if (it.type === "triple"){ for (const t of [it.s, it.p.term, it.o]) if (t && t.t === "var") add(t.v); } else if (it.patterns) walk(it.patterns); } };
  walk(items);
  return set;
}

// term → display string
function termStr(t){
  if (!t) return "";
  if (t.t === "iri") return t.v;
  let s = t.v;
  if (t.lang) s += " @" + t.lang;
  return s;
}

root.Core = { NS, iri, lit, termId, emptyConcept, conceptUri, conceptRes, xlLabelUri, buildTriples, toTurtle, toRdfXml, toJsonLd, toCsv, toMarkdown, toRdfJson, toAuditCsv, validate, autofix, parseTurtle, parseTriples, parseRdfXml, triplesToModel, sparql, termStr, safeLocal, parseCsvText, csvToModel, gridToModel, gridToCsv, looksLikeCsv, parseXlsx, csvTemplate, modelToGrid, toXlsx, ISO_BROADER, ISO_INVERSE, ISO_ENTAILS_SKOS };

})(typeof window !== "undefined" ? window : this);
