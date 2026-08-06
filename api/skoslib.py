"""
skoslib — the shared SKOS engine behind both the REST API and the MCP server.

Pure functions over rdflib + pySHACL, no web framework and no MCP imports, so
the exact same validation and conversion logic backs every interface.
"""
import os
from rdflib import Graph, RDF
from rdflib.namespace import SKOS

HERE = os.path.dirname(os.path.abspath(__file__))
SHAPES = os.path.join(HERE, "skos-shapes.ttl")

# format hint (content-type / short name) -> rdflib parser id
PARSE = {
    "text/turtle": "turtle", "application/x-turtle": "turtle", "ttl": "turtle", "turtle": "turtle",
    "application/rdf+xml": "xml", "rdf": "xml", "xml": "xml", "rdfxml": "xml", "rdf/xml": "xml",
    "application/ld+json": "json-ld", "jsonld": "json-ld", "json-ld": "json-ld",
    "application/n-triples": "nt", "nt": "nt", "ntriples": "nt",
    "application/rdf+json": "rdf-json", "rdf-json": "rdf-json", "rdf/json": "rdf-json",
}
# target name -> (rdflib serializer id, mime, extension)
SERIALIZE = {
    "turtle": ("turtle", "text/turtle", "ttl"), "ttl": ("turtle", "text/turtle", "ttl"),
    "xml": ("pretty-xml", "application/rdf+xml", "rdf"), "rdfxml": ("pretty-xml", "application/rdf+xml", "rdf"),
    "rdf/xml": ("pretty-xml", "application/rdf+xml", "rdf"),
    "json-ld": ("json-ld", "application/ld+json", "jsonld"), "jsonld": ("json-ld", "application/ld+json", "jsonld"),
    "nt": ("nt", "application/n-triples", "nt"), "ntriples": ("nt", "application/n-triples", "nt"),
    "rdf-json": ("rdf-json", "application/rdf+json", "rj"), "rdf/json": ("rdf-json", "application/rdf+json", "rj"),
}

INPUT_FORMATS = sorted(set(PARSE.values()))
OUTPUT_FORMATS = sorted(set(SERIALIZE.keys()))


def parse_rdf(data, hint=None):
    """Parse bytes/str into a Graph. `hint` is a content-type or short format name."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    if not data:
        raise ValueError("empty input — provide an RDF document")
    parser = PARSE.get((hint or "").lower()) if hint else None
    g = Graph()
    if parser:
        g.parse(data=data, format=parser)
        return g
    for p in ("turtle", "xml", "json-ld", "nt"):          # guess
        try:
            g.parse(data=data, format=p)
            return g
        except Exception:
            g = Graph()
    raise ValueError("could not parse input as Turtle, RDF/XML, JSON-LD or N-Triples")


def convert_rdf(data, to, hint=None):
    """Convert an RDF document to another serialization. Returns (text, mime, ext)."""
    to = (to or "turtle").lower()
    if to not in SERIALIZE:
        raise ValueError(f"unknown target format '{to}'. Use one of: {OUTPUT_FORMATS}")
    g = parse_rdf(data, hint)
    ser, mime, ext = SERIALIZE[to]
    out = g.serialize(format=ser)
    if isinstance(out, bytes):
        out = out.decode("utf-8")
    return out, mime, ext


def _label(g, c):
    for o in g.objects(c, SKOS.prefLabel):
        return str(o)
    return str(c)


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


def validate_rdf(data, hint=None):
    """Full report: parse + SHACL integrity shapes + structural checks + profile."""
    g = parse_rdf(data, hint)
    report = {"ok": True, "triples": len(g)}
    try:
        from pyshacl import validate as shacl_validate
        conforms, _rg, results_text = shacl_validate(
            g, shacl_graph=SHAPES, inference="rdfs", advanced=True, meta_shacl=False)
        report["shacl_conforms"] = bool(conforms)
        report["shacl_report"] = results_text
    except ImportError:
        report["shacl_conforms"] = None
        report["shacl_report"] = "pySHACL not installed — run: pip install pyshacl"
    except Exception as e:
        report["shacl_conforms"] = None
        report["shacl_report"] = f"SHACL error: {e}"
    findings, profile = structural_findings(g)
    report["structural_findings"] = findings
    report["profile"] = profile
    report["summary"] = {
        "violations": sum(1 for f in findings if f["severity"] == "violation"),
        "warnings": sum(1 for f in findings if f["severity"] == "warning"),
        "shacl_conforms": report["shacl_conforms"],
    }
    return report
