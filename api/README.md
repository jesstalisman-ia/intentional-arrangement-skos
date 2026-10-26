# REST API

A tiny Flask service over `skoslib.py` (rdflib + pySHACL). CORS is open so the browser app can call it.

```bash
pip install -r requirements.txt
python server.py            # http://127.0.0.1:8000  (PORT env to change)
```

## Endpoints

- `GET /` — self-describing index (formats, endpoints).
- `POST /validate` — send SKOS RDF (raw body + `Content-Type`, or `?from=ttl`). Returns a JSON report: `shacl_results` (one entry per SHACL result: severity, shape, focus node and its label, path, message), `shacl_conforms`, `shacl_report` (pySHACL's text), `structural_findings` (cycles, orphans), `profile` (concept count, documentation coverage, `shacl` counts by severity, `sound`), `summary`. Add `?detail=summary` to get the results grouped by shape and severity, each message once with its focus nodes, and no text report; a fraction of the size for large vocabularies.
- `POST /profile` — the profile alone: concepts, coverage, top concepts, structural findings, SHACL results grouped by shape, counts by severity, and `sound`, which is true only when nothing is at violation level, SHACL or structural.
- `POST /convert?to=<fmt>` — convert between `turtle | rdf/xml | json-ld | n-triples | rdf/json`. RDF/JSON (the W3C Note) is read and written by the engine itself, since rdflib has no plugin for it.

How the counts read. `summary.violations` and `summary.warnings` count SHACL results and structural findings together; `summary.info` counts the informational SHACL results. `shacl_conforms` keeps pySHACL's meaning and is false whenever any result exists, info included; `summary.no_violations` is the severity-aware flag to gate on.

Errors. A format the engine does not offer answers `400 {"ok": false, "error": "unsupported target format '…'", "supported_input": […], "supported_output": […]}`, so it is never mistaken for malformed input, which answers 400 with a generic message and no detail (the detail is logged server-side).

```bash
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' http://127.0.0.1:8000/validate
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' 'http://127.0.0.1:8000/convert?to=json-ld'
```

`skos-shapes.ttl` holds the SKOS integrity SHACL shapes (copy and tune per project).
