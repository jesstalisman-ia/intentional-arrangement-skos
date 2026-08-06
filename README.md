# Intentional Arrangement SKOS

**A small, standards-first studio for building, validating, visualizing and publishing SKOS taxonomies — the browser app, plus a REST API and an MCP server over the same engine.**

Built for readers and clients who want to stand up a *legitimate*, downloadable SKOS vocabulary and learn how it's done. Everything is open standards (W3C SKOS, ANSI/NISO Z39.19, ISO 25964, DCMI) and open source. The app is a single self-contained HTML file — no build step, no dependencies, runs from a file or GitHub Pages.

> Informed building, not blind building. Augmentation, not automation.

---

## What's in here

| Piece | What it is |
|---|---|
| **`app/`** | The **browser app** — one self-contained `index.html`. Open it or host it on GitHub Pages. |
| **`api/`** | A tiny **REST API** (Flask + rdflib + pySHACL): validate a vocabulary, convert between RDF serializations. |
| **`mcp-server/`** | An **MCP server** exposing the same engine as tools, so an assistant like Claude can validate/convert/profile a vocabulary. |
| **`docs/`** | The build essays — how this was made, and how to build it yourself. |

## The app — six components

1. **SKOS editor** — concepts as URIs, one `prefLabel` per language, `altLabel`/`hiddenLabel`, `definition`/`scopeNote`, `notation`, true poly‑hierarchy (`broader`/`narrower`), `related`, and the SKOS mapping properties. Readable **or opaque UUID** identifiers.
2. **Business view** — a read‑friendly browse of the vocabulary (breadcrumb, definition, synonyms, broader/narrower) for the people who aren't taxonomists.
3. **Import / Export** — export to **Turtle, RDF/XML, JSON‑LD, RDF/JSON, CSV** and **Markdown**; import SKOS RDF (paste or file). *(XLSX and multi‑format import via the API are on the roadmap below.)*
4. **qSKOS validator** — the SKOS quality checks in the edit loop: missing/duplicate preferred labels (S14), label disjointness (S13), `related`/`broader` clashes (S27), cyclic hierarchy, orphans, undocumented concepts, and more — with one‑click fixes.
5. **Concept‑model visualizer** — a force‑directed bubble‑and‑line view of the scheme, synced to the editor.
6. **DCMI scheme metadata** — Dublin Core metadata for the concept scheme (title, description, creator, publisher, created, rights, language) and identifiers.

## Three ways to use it

### 1. The app (browser / GitHub Pages)
Open `app/index.html` directly, or serve it:
```bash
cd app && python3 -m http.server 8080     # http://localhost:8080
```
Pushing to `main` auto‑deploys the app to **GitHub Pages** via `.github/workflows/pages.yml` (enable Pages → "GitHub Actions" in repo settings).

### 2. The REST API
```bash
cd api && pip install -r requirements.txt && python server.py     # http://127.0.0.1:8000
# validate a vocabulary
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' http://127.0.0.1:8000/validate
# convert Turtle -> JSON-LD
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' 'http://127.0.0.1:8000/convert?to=json-ld'
```
See [`api/README.md`](api/README.md).

### 3. The MCP server
```bash
cd mcp-server && pip install -r requirements.txt && python skos_mcp.py
```
Register it with an MCP client (Claude Desktop / Claude Code):
```json
{ "mcpServers": { "skos": { "command": "python", "args": ["/abs/path/mcp-server/skos_mcp.py"] } } }
```
Tools: `validate_skos`, `convert_skos`, `skos_profile`. See [`mcp-server/README.md`](mcp-server/README.md).

## Build it yourself

The point of this repo is that you can build it too — with an AI partner, but grounded in your own patterns and the field's standards. The essays in [`docs/`](docs/) walk through the *how*: assembling the SKOS "skill" (your example files + Z39.19 + ISO 25964 + the SKOS spec), modeling from what you already have, the editor's capture/render options, the business view, qSKOS, and import/export.

## Standards

- **W3C SKOS** — the RDF vocabulary for concept schemes.
- **ANSI/NISO Z39.19‑2005** — controlled‑vocabulary construction (term form, USE/UF, BT/NT/RT, scope notes).
- **ISO 25964‑1/‑2** — thesauri and interoperability.
- **DCMI / Dublin Core** — concept‑scheme metadata.
- Validation shapes: [`api/skos-shapes.ttl`](api/skos-shapes.ttl) (SHACL).

## Roadmap

- XLSX export/import in the app.
- Multi‑format **import** in the app (RDF/XML, JSON‑LD, RDF/JSON) — routed through the convert API.
- Trim remaining inert code paths for an even leaner single file.

## License

[MIT](LICENSE).
