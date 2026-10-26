# Intentional Arrangement SKOS Editor © 2026 Contextually LLC (d/b/a Ontology Pipeline)
# Size-based source-available license: Apache License 2.0 for organizations under 75
# employees; a written enterprise license is required at 75+ (Hello@ontologypipeline.com).
# Not an OSI-approved open-source license. See LICENSE / NOTICE.
"""
skoslib — the shared SKOS engine behind both the REST API and the MCP server.

Pure functions over rdflib + pySHACL, no web framework and no MCP imports, so
the exact same validation and conversion logic backs every interface.
"""
import json
import logging
import os
from rdflib import Graph, RDF, URIRef, BNode, Literal, Namespace
from rdflib.namespace import SKOS

log = logging.getLogger("iaskos.skoslib")

HERE = os.path.dirname(os.path.abspath(__file__))
SHAPES = os.path.join(HERE, "skos-shapes.ttl")
SH = Namespace("http://www.w3.org/ns/shacl#")


class UnsupportedFormat(ValueError):
    """A target or source format the engine does not offer (as opposed to malformed input)."""


# format hint (content-type / short name) -> parser id ("rdf-json" is handled here, not by rdflib)
PARSE = {
    "text/turtle": "turtle", "application/x-turtle": "turtle", "ttl": "turtle", "turtle": "turtle",
    "application/rdf+xml": "xml", "rdf": "xml", "xml": "xml", "rdfxml": "xml", "rdf/xml": "xml",
    "application/ld+json": "json-ld", "jsonld": "json-ld", "json-ld": "json-ld",
    "application/n-triples": "nt", "nt": "nt", "ntriples": "nt", "n-triples": "nt",
    "application/rdf+json": "rdf-json", "rdf-json": "rdf-json", "rdf/json": "rdf-json", "rj": "rdf-json",
}
# target name -> (serializer id, mime, extension)
SERIALIZE = {
    "turtle": ("turtle", "text/turtle", "ttl"), "ttl": ("turtle", "text/turtle", "ttl"),
    "xml": ("pretty-xml", "application/rdf+xml", "rdf"), "rdfxml": ("pretty-xml", "application/rdf+xml", "rdf"),
    "rdf/xml": ("pretty-xml", "application/rdf+xml", "rdf"),
    "json-ld": ("json-ld", "application/ld+json", "jsonld"), "jsonld": ("json-ld", "application/ld+json", "jsonld"),
    "nt": ("nt", "application/n-triples", "nt"), "ntriples": ("nt", "application/n-triples", "nt"),
    "n-triples": ("nt", "application/n-triples", "nt"),
    "rdf-json": ("rdf-json", "application/rdf+json", "rj"), "rdf/json": ("rdf-json", "application/rdf+json", "rj"),
}

INPUT_FORMATS = sorted(set(PARSE.values()))
OUTPUT_FORMATS = sorted(set(SERIALIZE.keys()))


# ---------------------------------------------------------------- RDF/JSON
# rdflib ships no RDF/JSON plugin (W3C Note, 2013), so the two directions live here:
#   { "<subject>": { "<predicate>": [ {"type":"uri"|"literal"|"bnode", "value":…, "lang":…, "datatype":…} ] } }
def _rdf_json_term(o):
    if isinstance(o, URIRef):
        return {"type": "uri", "value": str(o)}
    if isinstance(o, BNode):
        return {"type": "bnode", "value": "_:" + str(o)}
    d = {"type": "literal", "value": str(o)}
    if o.language:
        d["lang"] = o.language
    elif o.datatype:
        d["datatype"] = str(o.datatype)
    return d


def to_rdf_json(g):
    out = {}
    for s, p, o in sorted(g, key=lambda t: (str(t[0]), str(t[1]), str(t[2]))):
        sk = ("_:" + str(s)) if isinstance(s, BNode) else str(s)
        out.setdefault(sk, {}).setdefault(str(p), []).append(_rdf_json_term(o))
    return json.dumps(out, indent=2, ensure_ascii=False)


def _node(key, bnodes):
    if key.startswith("_:"):
        return bnodes.setdefault(key, BNode(key[2:]))
    return URIRef(key)


def parse_rdf_json(data):
    if isinstance(data, bytes):
        data = data.decode("utf-8")
    doc = json.loads(data)
    if not isinstance(doc, dict):
        raise ValueError("RDF/JSON must be an object keyed by subject")
    g, bnodes = Graph(), {}
    for sk, preds in doc.items():
        if not isinstance(preds, dict):
            raise ValueError("RDF/JSON: each subject maps to an object keyed by predicate")
        s = _node(sk, bnodes)
        for pk, objs in preds.items():
            if not isinstance(objs, list):
                raise ValueError("RDF/JSON: each predicate maps to a list of objects")
            for ob in objs:
                t = ob.get("type")
                if t == "uri":
                    o = URIRef(ob["value"])
                elif t == "bnode":
                    o = _node(ob["value"] if str(ob["value"]).startswith("_:") else "_:" + str(ob["value"]), bnodes)
                elif t == "literal":
                    o = Literal(ob["value"], lang=ob.get("lang")) if ob.get("lang") else \
                        Literal(ob["value"], datatype=URIRef(ob["datatype"])) if ob.get("datatype") else Literal(ob["value"])
                else:
                    raise ValueError("RDF/JSON: object type must be uri, bnode or literal")
                g.add((s, URIRef(pk), o))
    return g


# ---------------------------------------------------------------- parse / convert
def parse_rdf(data, hint=None):
    """Parse bytes/str into a Graph. `hint` is a content-type or short format name."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    if not data:
        raise ValueError("empty input — provide an RDF document")
    hint = (hint or "").lower()
    if hint and hint not in PARSE:
        raise UnsupportedFormat(f"unsupported source format '{hint}'. Use one of: {INPUT_FORMATS}")
    parser = PARSE.get(hint) if hint else None
    if parser == "rdf-json":
        return parse_rdf_json(data)
    g = Graph()
    if parser:
        g.parse(data=data, format=parser)
        return g
    # guess: RDF/JSON is tried before JSON-LD, because the JSON-LD parser accepts an RDF/JSON
    # document and reads its {"type","value"} objects as nodes, which is wrong rather than an error
    for p in ("turtle", "xml", "rdf-json", "json-ld", "nt"):
        try:
            if p == "rdf-json":
                return parse_rdf_json(data)
            g.parse(data=data, format=p)
            if len(g):
                return g
        except Exception:
            pass
        g = Graph()
    raise ValueError("could not parse input as Turtle, RDF/XML, RDF/JSON, JSON-LD or N-Triples")


def convert_rdf(data, to, hint=None):
    """Convert an RDF document to another serialization. Returns (text, mime, ext)."""
    to = (to or "turtle").lower()
    if to not in SERIALIZE:
        raise UnsupportedFormat(f"unsupported target format '{to}'. Use one of: {OUTPUT_FORMATS}")
    g = parse_rdf(data, hint)
    ser, mime, ext = SERIALIZE[to]
    if ser == "rdf-json":
        return to_rdf_json(g), mime, ext
    out = g.serialize(format=ser)
    if isinstance(out, bytes):
        out = out.decode("utf-8")
    return out, mime, ext


# ---------------------------------------------------------------- checks
def _label(g, c):
    best = None
    for o in g.objects(c, SKOS.prefLabel):
        if getattr(o, "language", None) == "en":
            return str(o)
        best = best or str(o)
    return best or str(c)


def structural_findings(g):
    """qSKOS-style checks SHACL doesn't cover well: cycles, orphans, coverage."""
    findings = []
    concepts = set(g.subjects(RDF.type, SKOS.Concept))

    def ancestors(c, seen):
        for p in g.objects(c, SKOS.broader):
            if p not in seen:
                seen.add(p); ancestors(p, seen)
        return seen

    for c in concepts:
        if c in ancestors(c, set()):
            findings.append({"severity": "violation", "check": "cyclic-hierarchy",
                             "concept": str(c), "message": f"'{_label(g, c)}' is its own ancestor via skos:broader"})
    for c in concepts:
        is_top = (None, SKOS.hasTopConcept, c) in g or (c, SKOS.topConceptOf, None) in g
        if not is_top and (c, SKOS.broader, None) not in g and (c, SKOS.narrower, None) not in g:
            findings.append({"severity": "warning", "check": "orphan",
                             "concept": str(c), "message": f"'{_label(g, c)}' has no broader/narrower and is not a top concept"})
    documented = sum(1 for c in concepts if (c, SKOS.definition, None) in g or (c, SKOS.scopeNote, None) in g)
    profile = {
        "concepts": len(concepts),
        "documented": documented,
        "documentation_coverage": round(documented / len(concepts), 3) if concepts else 0.0,
        "top_concepts": len(set(g.objects(None, SKOS.hasTopConcept)) | set(g.subjects(SKOS.topConceptOf, None))),
    }
    return findings, profile


_SHAPES_GRAPH = None


def _shapes_graph():
    global _SHAPES_GRAPH
    if _SHAPES_GRAPH is None:
        _SHAPES_GRAPH = Graph().parse(SHAPES, format="turtle")
    return _SHAPES_GRAPH


def _shape_name(shape):
    """A readable name for a result's source shape: the node shape's CURIE, also for its property shapes."""
    sg = _shapes_graph()
    if isinstance(shape, BNode):                      # a sh:property [...] inside a node shape
        for parent in sg.subjects(SH.property, shape):
            shape = parent
            break
    if isinstance(shape, URIRef):
        try:
            return sg.namespace_manager.normalizeUri(shape)
        except Exception:
            return str(shape)
    return "_:" + str(shape)


_SEVERITY = {SH.Violation: "violation", SH.Warning: "warning", SH.Info: "info"}


def shacl_results(results_graph, data_graph):
    """pySHACL's results graph as a list of plain dicts, one per sh:ValidationResult."""
    out = []
    for r in results_graph.subjects(RDF.type, SH.ValidationResult):
        focus = results_graph.value(r, SH.focusNode)
        path = results_graph.value(r, SH.resultPath)
        value = results_graph.value(r, SH.value)
        item = {
            "severity": _SEVERITY.get(results_graph.value(r, SH.resultSeverity), "violation"),
            "shape": _shape_name(results_graph.value(r, SH.sourceShape)),
            "focus_node": str(focus) if focus is not None else None,
            "focus_label": _label(data_graph, focus) if isinstance(focus, URIRef) and (focus, SKOS.prefLabel, None) in data_graph else None,
            "result_path": str(path) if path is not None else None,
            "message": str(results_graph.value(r, SH.resultMessage) or ""),
        }
        if value is not None:
            item["value"] = str(value)
        out.append(item)
    order = {"violation": 0, "warning": 1, "info": 2}
    out.sort(key=lambda x: (order[x["severity"]], x["shape"], x["focus_node"] or ""))
    return out


def summarize_results(results):
    """The same results grouped by shape, severity and message, each message once, with the focus nodes."""
    groups = {}
    for r in results:
        key = (r["severity"], r["shape"], r["message"])
        grp = groups.setdefault(key, {"severity": r["severity"], "shape": r["shape"], "message": r["message"],
                                      "count": 0, "focus_nodes": []})
        grp["count"] += 1
        if r["focus_node"] and r["focus_node"] not in grp["focus_nodes"]:
            grp["focus_nodes"].append(r["focus_node"])
    order = {"violation": 0, "warning": 1, "info": 2}
    return sorted(groups.values(), key=lambda x: (order[x["severity"]], x["shape"], x["message"]))


def validate_rdf(data, hint=None, detail="full"):
    """Full report: parse + SHACL integrity shapes + structural checks + profile.

    detail="full"    every SHACL result as structured data, plus pySHACL's text report
    detail="summary" results grouped by shape and severity, no text report (small enough for a tool call)
    """
    detail = "summary" if str(detail or "").lower() == "summary" else "full"
    g = parse_rdf(data, hint)
    report = {"ok": True, "triples": len(g)}
    results, shacl_ran = [], False
    try:
        from pyshacl import validate as shacl_validate
        # the parsed shapes graph is passed, not the path, so the blank-node property shapes in the
        # results are the same nodes as in our copy and can be traced back to their node shape
        conforms, rg, results_text = shacl_validate(
            g, shacl_graph=_shapes_graph(), inference="rdfs", advanced=True, meta_shacl=False)
        if not hasattr(rg, "subjects"):               # pySHACL hands back a ValidationFailure object, not a graph
            raise RuntimeError(str(results_text))
        shacl_ran = True
        results = shacl_results(rg, g)
        report["shacl_conforms"] = bool(conforms)
        if detail == "full":
            report["shacl_report"] = results_text
    except ImportError:
        report["shacl_conforms"] = None
        report["shacl_error"] = "pySHACL not installed — run: pip install pyshacl"
    except Exception:
        # Log the detail server-side; the report is returned to HTTP clients, so
        # it must not carry exception/stack text (code-scanning: py/stack-trace-exposure).
        log.exception("SHACL validation failed")
        report["shacl_conforms"] = None
        report["shacl_error"] = "SHACL validation could not be completed for this input."
    report["shacl_results"] = summarize_results(results) if detail == "summary" else results
    counts = {s: sum(1 for r in results if r["severity"] == s) for s in ("violation", "warning", "info")}
    findings, profile = structural_findings(g)
    profile["shacl"] = {"ran": shacl_ran, "conforms": report["shacl_conforms"],
                        "violations": counts["violation"], "warnings": counts["warning"], "info": counts["info"]}
    violations = counts["violation"] + sum(1 for f in findings if f["severity"] == "violation")
    warnings = counts["warning"] + sum(1 for f in findings if f["severity"] == "warning")
    profile["sound"] = shacl_ran and violations == 0          # nothing at violation level, SHACL or structural
    report["structural_findings"] = findings
    report["profile"] = profile
    report["summary"] = {
        "violations": violations,            # SHACL sh:Violation results + structural violations
        "warnings": warnings,                # SHACL sh:Warning results + structural warnings
        "info": counts["info"],
        "shacl_conforms": report["shacl_conforms"],   # pySHACL's flag: false whenever any result exists, info included
        "no_violations": violations == 0,
        "detail": detail,
    }
    return report


def profile_rdf(data, hint=None):
    """The profile alone: counts, coverage, structural findings, and SHACL result counts by severity."""
    report = validate_rdf(data, hint, detail="summary")
    return {"profile": report["profile"], "findings": report["structural_findings"],
            "shacl_results": report["shacl_results"], "summary": report["summary"], "triples": report["triples"]}


# ---------------------------------------------------------------- parse: the vocabulary itself, compactly
_NOTE_PROPS = ("definition", "scopeNote", "example", "note", "historyNote", "editorialNote", "changeNote")
_MAPPING_PROPS = ("exactMatch", "closeMatch", "broadMatch", "narrowMatch", "relatedMatch")


def _lit_by_lang(g, s, p):
    """{lang: value} for a property's literal values; untagged literals go under ''."""
    out = {}
    for o in g.objects(s, p):
        out.setdefault(getattr(o, "language", None) or "", str(o))
    return out


def _pick(d, lang):
    """One value from a {lang: value} map: the asked-for language, then en, then untagged, then any."""
    if not d:
        return None
    for k in ((lang or "").lower(), "en", ""):
        if k in d:
            return d[k]
    return next(iter(d.values()))


def parse_vocabulary(data, hint=None, scheme=None, query=None, lang=None, detail="concepts", limit=200, offset=0):
    """The vocabulary's content as plain data, for a client or a model to ground on.

    detail: "counts"   schemes and counts only
            "labels"   each concept as uri, label, notation and broader: a compact index
            "concepts" labels plus definition, scope note, narrower, related, scheme, top (default)
            "full"     every note and mapping, labels in every language
    scheme: keep concepts in this scheme (its IRI, or a substring of its IRI or title)
    query:  keep concepts whose preferred, alternative or hidden label, or notation, contains this text
    lang:   preferred language for the single `label` and the notes
    Concepts are sorted by notation, then label, and paged with limit/offset.
    """
    g = parse_rdf(data, hint)
    detail = detail if detail in ("counts", "labels", "concepts", "full") else "concepts"
    limit = max(1, min(int(limit or 200), 2000)); offset = max(0, int(offset or 0))

    schemes = []
    for s in sorted(set(g.subjects(RDF.type, SKOS.ConceptScheme)), key=str):
        title = _lit_by_lang(g, s, URIRef("http://purl.org/dc/terms/title")) or _lit_by_lang(g, s, SKOS.prefLabel) \
            or _lit_by_lang(g, s, URIRef("http://www.w3.org/2000/01/rdf-schema#label"))
        desc = _lit_by_lang(g, s, URIRef("http://purl.org/dc/terms/description"))
        members = set(g.subjects(SKOS.inScheme, s)) | set(g.subjects(SKOS.topConceptOf, s))
        tops = set(g.objects(s, SKOS.hasTopConcept)) | set(g.subjects(SKOS.topConceptOf, s))
        schemes.append({"uri": str(s), "title": _pick(title, lang), "description": _pick(desc, lang),
                        "concepts": len(members), "top_concepts": sorted(str(t) for t in tops)})

    concepts = set(g.subjects(RDF.type, SKOS.Concept))
    languages = sorted({getattr(o, "language", None) for c in concepts for o in g.objects(c, SKOS.prefLabel) if getattr(o, "language", None)})
    counts = {"concepts": len(concepts), "schemes": len(schemes),
              "collections": len(set(g.subjects(RDF.type, SKOS.Collection)) | set(g.subjects(RDF.type, SKOS.OrderedCollection))),
              "languages": languages, "triples": len(g)}
    if detail == "counts":
        return {"schemes": schemes, "counts": counts}

    # filters
    if scheme:
        want = str(scheme).lower()
        hits = {URIRef(x["uri"]) for x in schemes if x["uri"].lower() == want or want in x["uri"].lower() or want in (x["title"] or "").lower()}
        concepts = {c for c in concepts if any((c, SKOS.inScheme, h) in g or (c, SKOS.topConceptOf, h) in g for h in hits)}
    if query:
        q = str(query).lower()

        def matches(c):
            for p in (SKOS.prefLabel, SKOS.altLabel, SKOS.hiddenLabel, SKOS.notation):
                if any(q in str(o).lower() for o in g.objects(c, p)):
                    return True
            return False
        concepts = {c for c in concepts if matches(c)}

    def record(c):
        pref = _lit_by_lang(g, c, SKOS.prefLabel)
        notation = next((str(o) for o in g.objects(c, SKOS.notation)), None)
        r = {"uri": str(c), "label": _pick(pref, lang), "notation": notation,
             "broader": sorted(str(o) for o in g.objects(c, SKOS.broader))}
        if detail == "labels":
            return r
        r["altLabels"] = sorted(str(o) for o in g.objects(c, SKOS.altLabel) if not lang or (getattr(o, "language", None) or lang) == lang)
        r["definition"] = _pick(_lit_by_lang(g, c, SKOS.definition), lang)
        r["scopeNote"] = _pick(_lit_by_lang(g, c, SKOS.scopeNote), lang)
        r["narrower"] = sorted(str(o) for o in g.objects(c, SKOS.narrower))
        r["related"] = sorted(str(o) for o in g.objects(c, SKOS.related))
        r["inScheme"] = sorted({str(o) for o in g.objects(c, SKOS.inScheme)} | {str(o) for o in g.objects(c, SKOS.topConceptOf)})
        r["top"] = (c, SKOS.topConceptOf, None) in g or (None, SKOS.hasTopConcept, c) in g
        if detail == "full":
            r["prefLabel"] = pref
            r["altLabel"] = [{"value": str(o), "lang": getattr(o, "language", None)} for o in g.objects(c, SKOS.altLabel)]
            r["hiddenLabel"] = [{"value": str(o), "lang": getattr(o, "language", None)} for o in g.objects(c, SKOS.hiddenLabel)]
            r["notes"] = {n: _lit_by_lang(g, c, getattr(SKOS, n)) for n in _NOTE_PROPS if (c, getattr(SKOS, n), None) in g}
            r["mappings"] = {m: sorted(str(o) for o in g.objects(c, getattr(SKOS, m))) for m in _MAPPING_PROPS if (c, getattr(SKOS, m), None) in g}
            r["deprecated"] = (c, URIRef("http://www.w3.org/2002/07/owl#deprecated"), Literal(True)) in g
        return r

    rows = [record(c) for c in concepts]
    rows.sort(key=lambda r: ((r["notation"] or "~"), (r["label"] or "").lower(), r["uri"]))
    total = len(rows)
    page = rows[offset:offset + limit]
    return {"schemes": schemes, "counts": counts,
            "concepts": page,
            "page": {"offset": offset, "limit": limit, "returned": len(page), "total": total,
                     "next_offset": offset + limit if offset + limit < total else None},
            "filters": {"scheme": scheme or None, "query": query or None, "lang": lang or None, "detail": detail}}
