# REST API

A tiny Flask service over `skoslib.py` (rdflib + pySHACL). CORS is open so the browser app can call it.

```bash
pip install -r requirements.txt
python server.py            # http://127.0.0.1:8000  (PORT env to change)
```

## Endpoints

- `GET /` — self-describing index (formats, endpoints).
- `POST /validate` — send SKOS RDF (raw body + `Content-Type`, or `?from=ttl`). Returns a JSON report: `shacl_conforms`, `structural_findings` (cycles, orphans), `profile` (concept count, documentation coverage), `summary`.
- `POST /convert?to=<fmt>` — convert between `turtle | rdf/xml | json-ld | n-triples | rdf/json`.

```bash
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' http://127.0.0.1:8000/validate
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' 'http://127.0.0.1:8000/convert?to=json-ld'
```

`skos-shapes.ttl` holds the SKOS integrity SHACL shapes (copy and tune per project).
