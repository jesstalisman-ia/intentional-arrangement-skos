// Engine regression tests for app/core.js — the reports in issues #128 to #135.
// Runs under Node (node tools/test_core.js) and inside the editor page (fetch + eval, see tools/smoke.py).
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports && typeof require === "function";
  const Core = isNode ? require("../app/core.js").Core : root.Core;
  const fails = [], lines = [];
  const check = (name, cond, extra) => { lines.push((cond ? "PASS " : "FAIL ") + name + (cond || extra === undefined ? "" : "  " + JSON.stringify(extra).slice(0, 200))); if (!cond) fails.push(name); };
  const SKOS = "http://www.w3.org/2004/02/skos/core#";
  const mk = (base, prefix) => ({ base, prefix, idStyle: "text", defaultLang: "en",
    scheme: { uri: base.replace(/[#/]$/, ""), title: "T", description: "", creator: "", publisher: "", created: "2026-01-01", issued: "", modified: "", rights: "", license: "", version: "", lang: "en" },
    concepts: {}, order: [], collections: {}, documents: {}, agents: {} });
  const add = (M, id, label, broader, extra) => { const c = Core.emptyConcept(id); c.pref = [{ val: label, lang: "en" }]; c.broader = broader || []; c.top = !broader; Object.assign(c, extra || {}); M.concepts[id] = c; M.order.push(id); return c; };
  try {
  const m = mk("http://ex.org/t/", "t"); add(m, "alpha", "Alpha"); add(m, "beta", "Beta", ["alpha"]); add(m, "gamma", "Gamma", ["alpha"]);
  const T = Core.buildTriples(m, {}).triples;
  const P = "PREFIX skos: <" + SKOS + ">\n";
  const rows = q => Core.sparql(q, T).rows.map(r => { const o = {}; for (const k in r) o[k] = r[k] && r[k].v !== undefined ? r[k].v : r[k]; return o; });

  // #128
  let r = rows(P + "SELECT ?c ?l WHERE { ?c a skos:Concept ; skos:prefLabel ?l . } ORDER BY ?l");
  check("#128 reused variable keeps its binding", r.length === 3 && r.every(x => x.c && x.c.startsWith("http://ex.org/t/")), r);
  r = rows(P + "SELECT ?l ?p WHERE { ?c skos:prefLabel ?l . OPTIONAL { ?c skos:broader ?b . ?b skos:prefLabel ?p } }");
  check("#128 OPTIONAL pairs each label with its own parent", r.length === 3 && r.find(x => x.l === "Alpha").p == null && r.find(x => x.l === "Beta").p === "Alpha" && r.find(x => x.l === "Gamma").p === "Alpha", r);
  // #129
  r = rows(P + "SELECT ?l WHERE { ?c skos:prefLabel ?l } ORDER BY ASC(?l) LIMIT 1");
  check("#129 LIMIT after ORDER BY ASC(?l)", r.length === 1 && r[0].l === "Alpha", r);
  r = rows(P + "SELECT ?l WHERE { ?c skos:prefLabel ?l } ORDER BY ASC(?l) OFFSET 1 LIMIT 1");
  check("#129 OFFSET after ORDER BY ASC(?l)", r.length === 1 && r[0].l === "Beta", r);
  r = rows(P + "SELECT ?l WHERE { ?c skos:prefLabel ?l } ORDER BY DESC(?l) LIMIT 1");
  check("#129 DESC still works", r.length === 1 && r[0].l === "Gamma", r);
  // #130
  r = rows(P + 'SELECT ?l WHERE { ?c skos:prefLabel ?l . FILTER(?l < "B") }');
  check("#130 FILTER with <", r.length === 1 && r[0].l === "Alpha", r);
  r = rows(P + 'SELECT ?l WHERE { ?c skos:prefLabel ?l . FILTER(?l <= "Beta") }');
  check("#130 FILTER with <=", r.length === 2, r);
  r = rows(P + "SELECT ?l WHERE { <http://ex.org/t/beta> skos:prefLabel ?l }");
  check("#130 an IRI still parses as an IRI", r.length === 1 && r[0].l === "Beta", r);
  // #131
  const t131 = '@prefix skos: <' + SKOS + '> .\n<http://ex.org/t/x> a skos:Concept ;\n  skos:prefLabel "p\\u00e4iv\\u00e4"@fi ;\n  skos:definition """say \\"hi\\""""@en ;\n  skos:scopeNote """a "b"""" .';
  const pm = Core.parseTurtle(t131); const cx = Object.values(pm.concepts)[0];
  check("#131 \\u escapes in a short string", cx.pref[0].val === "päivä" && cx.pref[0].lang === "fi", cx.pref);
  check("#131 escaped quotes in a long string keep content and language", cx.definition[0].val === 'say "hi"' && cx.definition[0].lang === "en", cx.definition);
  check("#131 a long string ending in a quote keeps it", cx.scopeNote[0].val === 'a "b"', cx.scopeNote);
  // #132
  const m2 = mk("http://ex.org/t/", "t"); add(m2, "v1.2", "Version"); add(m2, "child", "Child", ["v1.2"]);
  const ttl2 = Core.toTurtle(m2, {}); const back = Core.parseTurtle(ttl2);
  check("#132 a dotted local name survives a Turtle round trip", !!back.concepts["v1.2"] && !back.concepts["2"] && (back.concepts.child || {}).broader[0] === "v1.2", Object.keys(back.concepts));
  const m2b = mk("http://ex.org/t/", "t"); add(m2b, "v1.", "Trailing dot");
  check("#132 a local name ending in a dot is written in full", Core.toTurtle(m2b, {}).includes("<http://ex.org/t/v1.>"));
  // #133
  const t133 = '@prefix skos: <' + SKOS + '> . <http://ex.org/t/a> a skos:Concept ; skos:prefLabel "A"@en ; <http://schema.org/sameAs> <http://example.org/y> .';
  const pm3 = Core.parseTurtle(t133); const xml = Core.toRdfXml(pm3, {});
  check("#133 RDF/XML keeps a predicate outside the namespace table", /xmlns:ns1="http:\/\/schema\.org\/"/.test(xml) && /<ns1:sameAs rdf:resource="http:\/\/example\.org\/y"/.test(xml), xml.slice(0, 300));
  // #134
  const m4 = mk("http://ex.org/t/", "t"); add(m4, "f", "F", null, { uri: "http://other.org/f" });
  check("#134 CSV honours the concept's own URI", Core.toCsv(m4).includes("http://other.org/f") && !Core.toCsv(m4).includes("http://ex.org/t/f"));
  check("#134 Markdown honours the concept's own URI", Core.toMarkdown(m4).includes("http://other.org/f") && !Core.toMarkdown(m4).includes("http://ex.org/t/f"));
  // #135
  let csvOk = null; try { const cm = Core.csvToModel("id,label\na,Alpha\nb,Beta\n"); csvOk = Object.keys(cm.concepts).length; } catch (e) { csvOk = "ERR " + e.message; }
  check("#135 CSV import works wherever core.js runs", csvOk === 2, csvOk);

  } catch (e) { fails.push("exception: " + e.message); lines.push("EXCEPTION " + e.message + " " + String(e.stack || "").split("\n").slice(1, 3).join(" ")); }
  const summary = lines.join("\n") + "\n\n" + (fails.length ? "FAILURES: " + fails.join(" | ") : "ALL PASS (" + lines.length + " checks)");
  if (isNode) { console.log(summary); process.exit(fails.length ? 1 : 0); }
  root.__coreTestResult = { fails, lines, summary };
  return summary;
})(typeof window !== "undefined" ? window : globalThis);
