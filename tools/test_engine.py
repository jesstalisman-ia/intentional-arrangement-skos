#!/usr/bin/env python3
"""Engine tests — the shared SKOS engine (api/skoslib.py), the REST API and the MCP tools.

Covers the reports behind issues #122 to #127: RDF/JSON both ways and a specific error
for an unsupported format; SHACL violations counted in the summary and in the profile;
structured SHACL results with a compact option; the file_path and out_path guards of
the MCP tools; and the label-hygiene shapes. Self-contained: no server needs to run.

Usage:  python3 tools/test_engine.py            (from the repo root; needs api/ and
        mcp-server/ requirements installed)
Exit 0 = pass, 1 = fail (findings printed).
"""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))
sys.path.insert(0, os.path.join(ROOT, "mcp-server"))
import skoslib  # noqa: E402
from rdflib import Graph  # noqa: E402

FAILS = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (("  " + str(extra)[:200]) if (extra and not cond) else ""))
    if not cond:
        FAILS.append(name)


SKOS = "@prefix skos: <http://www.w3.org/2004/02/skos/core#> . @prefix dct: <http://purl.org/dc/terms/> . "

# issue #123: two @en prefLabels on ex:dogs (S14), one orphan
T123 = SKOS + """@prefix ex: <http://example.org/vocab/> .
ex:scheme a skos:ConceptScheme ; dct:title "Test Vocabulary"@en ; skos:hasTopConcept ex:animals .
ex:animals a skos:Concept ; skos:prefLabel "Animals"@en ; skos:definition "Living creatures."@en ; skos:inScheme ex:scheme ; skos:topConceptOf ex:scheme ; skos:narrower ex:dogs .
ex:dogs a skos:Concept ; skos:prefLabel "Dogs"@en , "Canines"@en ; skos:altLabel "Hounds"@en ; skos:broader ex:animals ; skos:inScheme ex:scheme .
ex:orphan a skos:Concept ; skos:prefLabel "Orphan Concept"@en ; skos:inScheme ex:scheme ."""

# issue #124: S27 clash and three concepts with no scheme
T124 = SKOS + """@prefix ex: <http://example.org/> .
ex:animals a skos:Concept ; skos:prefLabel "Animals"@en ; skos:narrower ex:cats .
ex:cats a skos:Concept ; skos:prefLabel "Cats"@en ; skos:broader ex:animals ; skos:related ex:animals .
ex:orphan a skos:Concept ; skos:prefLabel "Orphan"@en ."""

# issue #127: altLabel equal to another prefLabel, one-way related, whitespace in a label and a note
T127 = SKOS + """@prefix ex: <http://example.org/> .
ex:s a skos:ConceptScheme ; skos:hasTopConcept ex:org .
ex:org a skos:Concept ; skos:prefLabel "Organization"@en ; skos:altLabel "Company"@en ; skos:definition "A body of people. "@en ; skos:inScheme ex:s ; skos:topConceptOf ex:s ; skos:narrower ex:co ; skos:related ex:web .
ex:co a skos:Concept ; skos:prefLabel "Company"@en ; skos:definition "A commercial organization."@en ; skos:broader ex:org ; skos:inScheme ex:s .
ex:web a skos:Concept ; skos:prefLabel "Web  Platform"@en ; skos:definition "The web."@en ; skos:inScheme ex:s ; skos:topConceptOf ex:s ."""

CLEAN = SKOS + """@prefix ex: <http://example.org/> .
ex:s a skos:ConceptScheme ; dct:title "Clean vocabulary"@en ; dct:description "Three concepts that break no rule."@en ; dct:created "2026-01-01"^^<http://www.w3.org/2001/XMLSchema#date> ; dct:publisher "Test publisher" ; skos:hasTopConcept ex:a , ex:c .
ex:a a skos:Concept ; skos:prefLabel "Animals"@en ; skos:altLabel "Fauna"@en ; skos:definition "Living creatures."@en ; skos:inScheme ex:s ; skos:topConceptOf ex:s ; skos:narrower ex:b ; skos:related ex:c .
ex:b a skos:Concept ; skos:prefLabel "Dogs"@en ; skos:definition "Domestic canines."@en ; skos:broader ex:a ; skos:inScheme ex:s .
ex:c a skos:Concept ; skos:prefLabel "Pets"@en ; skos:definition "Animals kept at home."@en ; skos:inScheme ex:s ; skos:topConceptOf ex:s ; skos:related ex:a ."""


def main():
    sg = Graph().parse(os.path.join(ROOT, "api", "skos-shapes.ttl"), format="turtle")
    names = {str(s).split("#")[-1] for s in sg.subjects(None, None) if str(s).startswith("https://w3id.org/skos-integrity-shapes#")}
    check("shapes parse, label-hygiene shapes present",
          {"AltLabelIsAnotherPrefLabel", "AsymmetricRelated", "LabelWhitespace", "NoteWhitespace"} <= names)

    r = skoslib.validate_rdf(T123, "turtle")
    check("#123 summary.violations counts the S14 violation", r["summary"]["violations"] >= 1, r["summary"])
    check("#123 structured result names ex:dogs with a shape CURIE",
          any(x["focus_node"].endswith("dogs") and x["severity"] == "violation" and x["shape"].startswith("ix:") for x in r["shacl_results"]), r["shacl_results"][:2])
    check("#123 focus_label present", any(x.get("focus_label") == "Dogs" for x in r["shacl_results"]))
    check("#123 no_violations false, shacl_conforms false", r["summary"]["no_violations"] is False and r["summary"]["shacl_conforms"] is False)
    check("#123 profile carries shacl counts and sound=false", r["profile"]["shacl"]["violations"] >= 1 and r["profile"]["sound"] is False, r["profile"])
    check("#123 full detail carries pySHACL's text report", isinstance(r.get("shacl_report"), str) and "Violation" in r["shacl_report"])
    rs = skoslib.validate_rdf(T123, "turtle", detail="summary")
    check("summary detail: grouped, no text report", "shacl_report" not in rs and all("count" in g and "focus_nodes" in g for g in rs["shacl_results"]) and rs["summary"]["detail"] == "summary", list(rs.keys()))
    check("summary detail is smaller than full", len(json.dumps(rs)) < len(json.dumps(r)), (len(json.dumps(rs)), len(json.dumps(r))))

    p = skoslib.profile_rdf(T124, "turtle")
    check("#124 profile shacl violations >= 4 (S27 + no scheme x3) and sound=false", p["profile"]["shacl"]["violations"] >= 4 and p["profile"]["sound"] is False, p["profile"])
    check("#124 profile returns grouped shacl_results and summary", isinstance(p["shacl_results"], list) and "summary" in p)

    rj, mime, ext = skoslib.convert_rdf(T123, "rdf-json", "turtle")
    check("#122 rdf-json serializes", mime == "application/rdf+json" and ext == "rj" and json.loads(rj))
    g1 = skoslib.parse_rdf(T123, "turtle"); g2 = skoslib.parse_rdf(rj, "rdf/json")
    check("#122 rdf-json round trip keeps every triple", len(g1) == len(g2) and set(g1) == set(g2), (len(g1), len(g2)))
    check("#122 rdf-json is guessed without a hint", len(skoslib.parse_rdf(rj)) == len(g1))
    try:
        skoslib.convert_rdf(T123, "nope", "turtle"); check("#122 unsupported target raises UnsupportedFormat", False)
    except skoslib.UnsupportedFormat as e:
        check("#122 unsupported target raises UnsupportedFormat", "unsupported target format 'nope'" in str(e), str(e))
    try:
        skoslib.parse_rdf(T123, "nope"); check("unsupported source hint raises", False)
    except skoslib.UnsupportedFormat:
        check("unsupported source hint raises", True)

    r = skoslib.validate_rdf(T127, "turtle")
    hit = {x["shape"]: x["severity"] for x in r["shacl_results"]}
    check("#127 altLabel equal to another prefLabel fires as warning", hit.get("ix:AltLabelIsAnotherPrefLabel") == "warning", hit)
    check("#127 one-way related fires as info", hit.get("ix:AsymmetricRelated") == "info", hit)
    check("#127 doubled space in prefLabel fires as warning", hit.get("ix:LabelWhitespace") == "warning", hit)
    check("#127 trailing space in definition fires as warning", hit.get("ix:NoteWhitespace") == "warning", hit)
    rc = skoslib.validate_rdf(CLEAN, "turtle")
    check("clean vocabulary: no results, sound=true", rc["shacl_results"] == [] and rc["summary"]["violations"] == 0 and rc["profile"]["sound"] is True, rc["shacl_results"][:3])

    import server
    c = server.app.test_client()
    resp = c.post("/convert?to=rdf-json&from=turtle", data=T123, content_type="text/turtle")
    check("REST /convert rdf-json 200", resp.status_code == 200 and resp.mimetype == "application/rdf+json", (resp.status_code, resp.data[:80]))
    check("REST /convert rdf/json spelling 200", c.post("/convert?to=rdf%2Fjson", data=T123, content_type="text/turtle").status_code == 200)
    resp = c.post("/convert?to=nope", data=T123, content_type="text/turtle"); j = resp.get_json()
    check("REST unsupported target: 400, specific error, supported lists", resp.status_code == 400 and "unsupported target format 'nope'" in j["error"] and "supported_output" in j, j)
    resp = c.post("/convert?to=nt", data="this is not rdf", content_type="text/turtle"); j = resp.get_json()
    check("REST malformed input: 400 generic, no stack text", resp.status_code == 400 and "unsupported" not in j["error"] and "Traceback" not in json.dumps(j))
    j = c.post("/validate?detail=summary", data=T123, content_type="text/turtle").get_json()
    check("REST /validate?detail=summary", "shacl_report" not in j and j["summary"]["violations"] >= 1, j.get("summary"))
    j = c.post("/profile", data=T124, content_type="text/turtle").get_json()
    check("REST /profile with shacl counts", j["profile"]["shacl"]["violations"] >= 4, j.get("profile"))
    j = c.get("/").get_json(); check("REST index lists /profile and rdf-json", "POST /profile" in j["endpoints"] and "rdf-json" in j["output_formats"])

    os.environ.pop("IA_SKOS_FILES", None)
    import skos_mcp
    fn = lambda t: getattr(t, "fn", None) or getattr(t, "__wrapped__", None) or t  # noqa: E731
    validate, profile, convert = fn(skos_mcp.validate_skos), fn(skos_mcp.skos_profile), fn(skos_mcp.convert_skos)
    check("MCP validate_skos(text) defaults to summary", validate(T123, "turtle")["summary"]["detail"] == "summary")
    try:
        validate(file_path="/etc/hosts"); check("MCP file_path refused when IA_SKOS_FILES unset", False)
    except ValueError as e:
        check("MCP file_path refused when IA_SKOS_FILES unset", "IA_SKOS_FILES" in str(e))
    d = tempfile.mkdtemp(); open(os.path.join(d, "v.ttl"), "w").write(T123); os.environ["IA_SKOS_FILES"] = d
    check("MCP file_path inside IA_SKOS_FILES works, hint from extension", validate(file_path=os.path.join(d, "v.ttl"))["summary"]["violations"] >= 1)
    check("MCP profile from file", profile(file_path=os.path.join(d, "v.ttl"))["profile"]["concepts"] == 3)
    for bad in (os.path.join(d, "..", "..", "etc", "hosts"), "/etc/hosts"):
        try:
            validate(file_path=bad); check("MCP path outside IA_SKOS_FILES refused: " + bad, False)
        except ValueError:
            check("MCP path outside IA_SKOS_FILES refused: " + bad, True)
    msg = convert(file_path=os.path.join(d, "v.ttl"), to="json-ld", out_path=os.path.join(d, "v.jsonld"))
    check("MCP convert to out_path inside IA_SKOS_FILES", msg.startswith("written:") and os.path.getsize(os.path.join(d, "v.jsonld")) > 0, msg)
    try:
        convert(file_path=os.path.join(d, "v.ttl"), to="nt", out_path="/tmp/evil.nt"); check("MCP out_path outside refused", False)
    except ValueError:
        check("MCP out_path outside refused", True)
    try:
        convert(rdf=T123, to="nope"); check("MCP unsupported target raises", False)
    except skoslib.UnsupportedFormat:
        check("MCP unsupported target raises", True)

    print("\nFAILURES:", FAILS or "none")
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
