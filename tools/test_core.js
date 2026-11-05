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
  // compare the exported URI cells as whole values (a substring test on a URL
  // literal reads as a broken origin check to code scanning; it was never one)
  const csvUris = Core.toCsv(m4).split(/\r?\n/).slice(1).map(r => (r.split(",")[1] || "").replace(/^"|"$/g, ""));   // the uri column
  check("#134 CSV honours the concept's own URI", csvUris.some(u => u === "http://other.org/f") && !csvUris.some(u => u === "http://ex.org/t/f"), csvUris);
  const mdUris = (Core.toMarkdown(m4).match(/\*\*URI:\*\* `[^`]*`/g) || []).map(s => s.slice(s.indexOf("`") + 1, -1));
  check("#134 Markdown honours the concept's own URI", mdUris.some(u => u === "http://other.org/f") && !mdUris.some(u => u === "http://ex.org/t/f"), mdUris);
  // #135
  let csvOk = null; try { const cm = Core.csvToModel("id,label\na,Alpha\nb,Beta\n"); csvOk = Object.keys(cm.concepts).length; } catch (e) { csvOk = "ERR " + e.message; }
  check("#135 CSV import works wherever core.js runs", csvOk === 2, csvOk);

  } catch (e) { fails.push("exception: " + e.message); lines.push("EXCEPTION " + e.message + " " + String(e.stack || "").split("\n").slice(1, 3).join(" ")); }
  // #137 labels for external mapping targets
  try {
    const m7 = mk("http://ex.org/t/", "t"); add(m7, "car", "Car"); add(m7, "auto", "Automobile");
    m7.concepts.car.exactMatch = ["https://www.wikidata.org/entity/Q1420"]; m7.concepts.auto.closeMatch = ["https://www.wikidata.org/entity/Q1420"];
    m7.extLabels = { "https://www.wikidata.org/entity/Q1420": { val: "Car (Wikidata)", lang: "en" } };
    const ttl7 = Core.toTurtle(m7, {});
    check("#137 export writes rdfs:label on the mapping target, once", (ttl7.match(/Car \(Wikidata\)/g) || []).length === 1 && /<https:\/\/www\.wikidata\.org\/entity\/Q1420>\s+rdfs:label\s+"Car \(Wikidata\)"@en/.test(ttl7), ttl7.slice(-400));
    const back7 = Core.parseTurtle(ttl7);
    check("#137 import reads the label back as an editable extLabel", back7.extLabels && back7.extLabels["https://www.wikidata.org/entity/Q1420"] && back7.extLabels["https://www.wikidata.org/entity/Q1420"].val === "Car (Wikidata)", back7.extLabels);
    check("#137 the label is not also kept as a foreign triple", !(back7.foreign || []).some(t => t.p.v.endsWith("label") && t.s.v.includes("Q1420")), back7.foreign);
    check("#137 round trip is stable", Core.toTurtle(back7, {}).split("\n").length === ttl7.split("\n").length);
    check("#137 Markdown shows the label as the link text", Core.toMarkdown(m7).includes("[Car (Wikidata)](https://www.wikidata.org/entity/Q1420)"));
    const m7b = mk("http://ex.org/t/", "t"); add(m7b, "car", "Car"); m7b.concepts.car.exactMatch = ["https://www.wikidata.org/entity/Q1420"];
    check("#137 a mapping without a label exports as before", !/rdfs:label\s+"/.test(Core.toTurtle(m7b, {}).split("Q1420>")[1] || ""));
  } catch (e) { fails.push("exception in #137: " + e.message); lines.push("EXCEPTION #137 " + e.message); }
  // #140 successors inside and outside the scheme
  try {
    const m8 = mk("http://ex.org/t/", "t"); add(m8, "old", "Cluster"); add(m8, "nu", "Note Cluster"); add(m8, "gone", "Board");
    m8.concepts.old.deprecated = true; m8.concepts.old.isReplacedBy = ["nu"];
    m8.concepts.gone.deprecated = true; m8.concepts.gone.isReplacedBy = ["https://w3id.org/pkm/systems/Board"]; m8.concepts.gone.exactMatch = ["https://w3id.org/pkm/systems/Board"];
    m8.extLabels = { "https://w3id.org/pkm/systems/Board": { val: "Board", lang: "en" } };
    const ttl8 = Core.toTurtle(m8, {});
    check("#140 export writes a same-scheme successor and the inverse dcterms:replaces", /t:old[\s\S]*dcterms:isReplacedBy t:nu/.test(ttl8) && /t:nu[\s\S]*dcterms:replaces t:old/.test(ttl8), ttl8.slice(0, 600));
    check("#140 export writes an external successor as its IRI", /t:gone[\s\S]*dcterms:isReplacedBy <https:\/\/w3id\.org\/pkm\/systems\/Board>/.test(ttl8), ttl8);
    const back8 = Core.parseTurtle(ttl8);
    check("#140 import keeps the external successor as an IRI and mints no concept for it", (back8.concepts.gone.isReplacedBy || [])[0] === "https://w3id.org/pkm/systems/Board" && !Object.keys(back8.concepts).some(k => /Board$/.test(k) && k !== "gone"), { succ: back8.concepts.gone && back8.concepts.gone.isReplacedBy, ids: Object.keys(back8.concepts) });
    check("#140 import keeps the same-scheme successor by id", (back8.concepts.old.isReplacedBy || [])[0] === "nu", back8.concepts.old && back8.concepts.old.isReplacedBy);
    check("#140 dcterms:replaces does not survive as a foreign triple", !(back8.foreign || []).some(t => /replaces$/.test(t.p.v)), back8.foreign);
    check("#140 round trip is stable", Core.toTurtle(back8, {}).split("\n").length === ttl8.split("\n").length);
    const rep = Core.validate ? Core.validate(m8) : null;
    if (rep) { const items = rep.items || rep.findings || rep; check("#140 an IRI successor is not reported as dangling", !JSON.stringify(items).includes("danglingReplacedBy"), JSON.stringify(items).slice(0, 300)); }
  } catch (e) { fails.push("exception in #140: " + e.message); lines.push("EXCEPTION #140 " + e.message); }
  // #144 lifecycle checks in the in-app validator
  try {
    const m9 = mk("http://ex.org/t/", "t"); add(m9, "live", "Live"); add(m9, "ret", "Retired"); add(m9, "lost", "Lost"); add(m9, "kid", "Kid", ["ret"]);
    m9.concepts.live.definition = [{ val: "A live concept.", lang: "en" }]; m9.concepts.live.related = ["ret"];
    m9.concepts.ret.deprecated = true; m9.concepts.ret.isReplacedBy = ["live"];
    m9.concepts.lost.deprecated = true;
    m9.concepts.kid.definition = [{ val: "A child.", lang: "en" }];
    const rep = Core.validate(m9); const txt = JSON.stringify(rep);
    const codes = (rep.items || rep.findings || rep.issues || []).map(x => x.code || x.rule || x.id || "");
    const has = code => txt.includes('"' + code + '"');
    check("#144 a deprecated concept is not reported as undocumented", !((rep.items || rep.findings || rep.issues || []).some(x => (x.code === "undocumented" || x.rule === "undocumented") && /ret|lost/.test(JSON.stringify(x)))), txt.slice(0, 400));
    check("#144 a live related link to a deprecated concept is a warning", has("liveLinkToDeprecated"), codes);
    check("#144 a live broader link to a deprecated concept is a warning", (txt.match(/liveLinkToDeprecated/g) || []).length >= 2, codes);
    check("#144 a deprecated concept with no successor and no mapping is a warning", has("deprecatedNoForwarding") && /lost/.test(txt), codes);
    check("#144 a deprecated concept with a successor is not reported for forwarding", !/deprecatedNoForwarding[^}]*"ret"/.test(txt));
  } catch (e) { fails.push("exception in #144: " + e.message); lines.push("EXCEPTION #144 " + e.message); }
  // language tags: one canonical form everywhere (editor #111 #116)
  try {
    const cl = Core.canonLangTag;
    check("lang: BCP 47 case convention", cl("EN") === "en" && cl("nl-be") === "nl-BE" && cl("zh-hant") === "zh-Hant" && cl("sr-latn-rs") === "sr-Latn-RS", [cl("EN"), cl("nl-be"), cl("zh-hant"), cl("sr-latn-rs")]);
    check("lang: a deprecated two-letter code takes the registry's preferred value", cl("iw") === "he" && cl("in") === "id" && cl("IW-il") === "he-IL", [cl("iw"), cl("in"), cl("IW-il")]);
    check("lang: the language itself is never changed", cl("tl") === "tl" && cl("cmn") === "cmn", [cl("tl"), cl("cmn")]);
    check("lang: no tag stays empty; a malformed tag comes back unchanged for the validator", cl("") === "" && cl(null) === "" && cl("not a tag") === "not a tag", [cl(""), cl(null), cl("not a tag")]);
    const tL = '@prefix skos: <' + SKOS + '> . <http://ex.org/t/a> a skos:Concept ; skos:prefLabel "A"@EN ; skos:altLabel "Een"@NL-be .';
    const ca = Object.values(Core.parseTurtle(tL).concepts)[0];
    check("lang: import canonicalises tags", ca.pref[0].lang === "en" && ca.alt[0].lang === "nl-BE", { pref: ca.pref, alt: ca.alt });
    const mL = mk("http://ex.org/t/", "t"); add(mL, "a", "A"); mL.concepts.a.pref = [{ val: "A", lang: "EN" }, { val: "A again", lang: "en" }];
    const repL = JSON.stringify(Core.validate(mL));
    check("lang: a stored tag that is not canonical is a warning", repL.includes("langTagCase"), repL.slice(0, 300));
    check("lang: EN and en are one language in the one-preferred-label check", repL.includes("multiPrefLabel"), repL.slice(0, 300));
  } catch (e) { fails.push("exception in lang: " + e.message); lines.push("EXCEPTION lang " + e.message); }
  const summary = lines.join("\n") + "\n\n" + (fails.length ? "FAILURES: " + fails.join(" | ") : "ALL PASS (" + lines.length + " checks)");
  if (isNode) { console.log(summary); process.exit(fails.length ? 1 : 0); }
  root.__coreTestResult = { fails, lines, summary };
  return summary;
})(typeof window !== "undefined" ? window : globalThis);
