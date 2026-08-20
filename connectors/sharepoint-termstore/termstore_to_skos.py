"""SharePoint Term Store (Microsoft Graph shapes) -> SKOS.

This is the mapping engine, and it is deliberately transport-agnostic: it takes a
normalized dict (the shape graph_client.py produces from Microsoft Graph, and the
same shape a PnP/CSOM export can be massaged into) and returns an rdflib Graph of
SKOS. Nothing here talks to the network, so it is easy to test against a fixture.

Mapping (SharePoint -> SKOS/RDF):
  Term Set                     -> skos:ConceptScheme
  Term                         -> skos:Concept (+ skos:inScheme the set)
  top-level term               -> skos:topConceptOf (+ set skos:hasTopConcept)
  child term                   -> skos:broader parent (+ parent skos:narrower child)
  default label per language   -> skos:prefLabel@lang   (one per language)
  other labels / synonyms      -> skos:altLabel@lang
  description per language      -> skos:definition@lang
  term GUID                    -> concept URI + dcterms:identifier
  isDeprecated                 -> owl:deprecated true
  created / lastModified        -> dcterms:created / dcterms:modified (xsd:dateTime)
  custom properties            -> skos:note "key: value"

Set `xl=True` to emit SKOS-XL labels (skosxl:Label + skosxl:literalForm) alongside
the plain skos labels, matching the editor's SKOS-XL round-trip.
"""
from rdflib import Graph, URIRef, Literal, BNode, RDF, Namespace
from rdflib.namespace import SKOS, DCTERMS, OWL, RDFS, XSD

SKOSXL = Namespace("http://www.w3.org/2008/05/skos-xl#")


def _uri(base, guid):
    return URIRef(base.rstrip("/") + "/" + str(guid))


def _lang(tag):
    # SharePoint uses full BCP-47 tags (e.g. "en-US"); those are valid SKOS language
    # tags, so keep them as-is. Empty/None -> a plain literal (no tag).
    tag = (tag or "").strip()
    return tag or None


def build_graph(data, base="https://sharepoint.example/termstore/", xl=False):
    """data: {"store": {...}, "sets": [ {set...} ]}. Returns an rdflib Graph."""
    g = Graph()
    g.bind("skos", SKOS); g.bind("dcterms", DCTERMS); g.bind("owl", OWL); g.bind("rdfs", RDFS)
    if xl:
        g.bind("skosxl", SKOSXL)
    default_lang = ((data.get("store") or {}).get("defaultLanguageTag")) or "en"

    for s in data.get("sets", []):
        set_uri = _uri(base, s["id"])
        g.add((set_uri, RDF.type, SKOS.ConceptScheme))
        g.add((set_uri, DCTERMS.identifier, Literal(str(s["id"]))))
        names = s.get("localizedNames")
        if not names and s.get("name"):
            names = [{"languageTag": default_lang, "name": s["name"]}]
        for ln in (names or []):
            if ln.get("name"):
                g.add((set_uri, DCTERMS.title, Literal(ln["name"], lang=_lang(ln.get("languageTag") or default_lang))))
                g.add((set_uri, RDFS.label, Literal(ln["name"], lang=_lang(ln.get("languageTag") or default_lang))))
        if s.get("description"):
            g.add((set_uri, DCTERMS.description, Literal(s["description"])))
        for t in s.get("terms", []):
            _emit_term(g, t, set_uri, None, base, default_lang, xl)
    return g


def _emit_term(g, t, set_uri, parent_uri, base, default_lang, xl):
    uri = _uri(base, t["id"])
    g.add((uri, RDF.type, SKOS.Concept))
    g.add((uri, SKOS.inScheme, set_uri))
    g.add((uri, DCTERMS.identifier, Literal(str(t["id"]))))

    for i, lb in enumerate(t.get("labels", []) or []):
        name = lb.get("name")
        if not name:
            continue
        lang = _lang(lb.get("languageTag") or default_lang)
        pred = SKOS.prefLabel if lb.get("isDefault") else SKOS.altLabel
        g.add((uri, pred, Literal(name, lang=lang)))
        if xl:
            xlpred = SKOSXL.prefLabel if lb.get("isDefault") else SKOSXL.altLabel
            lbl = _uri(base, str(t["id"]) + "-lbl-" + str(i))
            g.add((uri, xlpred, lbl))
            g.add((lbl, RDF.type, SKOSXL.Label))
            g.add((lbl, SKOSXL.literalForm, Literal(name, lang=lang)))

    for d in t.get("descriptions", []) or []:
        if d.get("description"):
            g.add((uri, SKOS.definition, Literal(d["description"], lang=_lang(d.get("languageTag") or default_lang))))

    if t.get("isDeprecated"):
        g.add((uri, OWL.deprecated, Literal(True)))
    if t.get("createdDateTime"):
        g.add((uri, DCTERMS.created, Literal(t["createdDateTime"], datatype=XSD.dateTime)))
    if t.get("lastModifiedDateTime"):
        g.add((uri, DCTERMS.modified, Literal(t["lastModifiedDateTime"], datatype=XSD.dateTime)))
    for p in t.get("properties", []) or []:
        if p.get("key"):
            g.add((uri, SKOS.note, Literal(f'{p["key"]}: {p.get("value", "")}')))

    if parent_uri is None:
        g.add((uri, SKOS.topConceptOf, set_uri))
        g.add((set_uri, SKOS.hasTopConcept, uri))
    else:
        g.add((uri, SKOS.broader, parent_uri))
        g.add((parent_uri, SKOS.narrower, uri))

    for c in t.get("children", []) or []:
        _emit_term(g, c, set_uri, uri, base, default_lang, xl)


def to_turtle(data, base="https://sharepoint.example/termstore/", xl=False):
    return build_graph(data, base=base, xl=xl).serialize(format="turtle")


if __name__ == "__main__":
    import sys, json
    src = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else json.load(sys.stdin)
    base = sys.argv[2] if len(sys.argv) > 2 else "https://sharepoint.example/termstore/"
    sys.stdout.write(to_turtle(src, base=base))
