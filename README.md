# Intentional Arrangement SKOS

**A small, standards-first studio for building, validating, visualizing and publishing SKOS taxonomies — the browser app, plus a REST API and an MCP server over the same engine.**

Built for readers and clients who want to stand up a *legitimate*, downloadable SKOS vocabulary and learn how it's done. Open standards throughout (W3C SKOS, ANSI/NISO Z39.19, ISO 25964, DCMI). The app is a single self-contained HTML file — no build step, no dependencies. **Use it hosted** at **https://jesstalisman-ia.github.io/intentional-arrangement-skos/**, or download the file and open it in any browser.

> Informed building, not blind building. Augmentation, not automation.

📍 **[Roadmap](ROADMAP.md)** — what's shipped and what's next · 💡 **[Request a feature](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml)** or [report a bug](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml).

---

## What's in here

| Piece | What it is |
|---|---|
| **`app/`** | The **browser app** — one self-contained `index.html`. Download it and open it in any browser. |
| **`api/`** | A tiny **REST API** (Flask + rdflib + pySHACL): validate a vocabulary, convert between RDF serializations. |
| **`mcp-server/`** | An **MCP server** exposing the same engine as tools, so an assistant like Claude can validate/convert/profile a vocabulary. |
| **`docs/`** | readme.md, documentation and how‑to guides — [install](docs/install.md), [workspace (passcode, projects, autosave)](docs/workspace.md), [spreadsheet import](docs/spreadsheet-import.md), and the [SKOS reference](docs/skos-reference.md). |

## The app — six components

1. **SKOS editor** — concepts as URIs, one `prefLabel` per language, `altLabel`/`hiddenLabel`, `definition`/`scopeNote`, `notation`, true poly‑hierarchy (`broader`/`narrower`), `related`, and the SKOS mapping properties. Readable **or opaque UUID** identifiers.
2. **Business view** — a read‑friendly browse of the vocabulary (breadcrumb, definition, synonyms, broader/narrower) for the people who aren't taxonomists.
3. **Import / Export** — export to **Turtle, RDF/XML, JSON‑LD, RDF/JSON, CSV, Excel `.xlsx`** and **Markdown**; import SKOS from RDF (Turtle, RDF/XML, JSON‑LD, RDF/JSON) or a **spreadsheet** (CSV or Excel `.xlsx`). Excel is zipped/unzipped in the browser — no library, no upload — and spreadsheet import/export round‑trip. Building in a spreadsheet? See the [spreadsheet tutorial](docs/spreadsheet-import.md) and the [CSV template](docs/templates/skos-import-template.csv).
4. **qSKOS validator** — the SKOS quality checks in the edit loop: missing/duplicate preferred labels (S14), label disjointness (S13), `related`/`broader` clashes (S27), cyclic hierarchy, orphans, undocumented concepts, and more — with one‑click fixes.
5. **Concept‑model visualizer** — a force‑directed bubble‑and‑line view of the scheme, synced to the editor.
6. **DCMI scheme metadata** — Dublin Core metadata for the concept scheme (title, description, creator, publisher, created, issued, modified, rights, language) and identifiers.

## Your workspace

The editor holds several taxonomies at once, saves every change automatically, and can sit behind a passcode:

- **Local passcode** — an optional per‑browser lock (salted SHA‑256 in local storage) with "keep me signed in," a Lock button, and reset. It's a convenience lock, **not** encryption, and nothing is uploaded.
- **Welcome screen** — open an existing taxonomy or start a new one; delete inline.
- **Guided setup** — a new project starts with its Dublin Core metadata; only the **title** is required, and the created/published/modified dates auto‑fill.
- **Autosave** — every change persists to the browser, with a **✓ Saved** indicator. Manage projects (open, rename, duplicate, delete) from the **Projects** button.

Full walkthrough: [docs/workspace.md](docs/workspace.md).

## Three ways to use it

> New here? The [install & setup guide](docs/install.md) walks through standing up the editor — hosted, local, or your own deployed copy.

### 1. The app (in your browser)
Open `app/index.html` directly, or serve it:
```bash
cd app && python3 -m http.server 8080     # http://localhost:8080
```
That's it — the tool is that single file. It's also [hosted on GitHub Pages](https://jesstalisman-ia.github.io/intentional-arrangement-skos/), so you can just use it there.

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

## Hosting

The app is **live on GitHub Pages** at https://jesstalisman-ia.github.io/intentional-arrangement-skos/ (repo **Settings → Pages → Source: GitHub Actions**). Because it's a single static file, you can host your own copy anywhere:

- **GitHub Pages** — free: fork, then **Settings → Pages → Source: GitHub Actions**. Lands at `https://<you>.github.io/intentional-arrangement-skos/`.
- **Netlify / Cloudflare Pages** — free, with a custom domain. `netlify.toml` points the publish directory at `app/`, so it's a one-click import; then add a domain in the host's dashboard and one CNAME record at your registrar.

The app keeps all data in the visitor's own browser, so hosting it shares the *tool*, never anyone's vocabularies.

## Roadmap

See **[ROADMAP.md](ROADMAP.md)** for what's shipped, in progress, and planned — and how to request features or report bugs.

## License

Intentional Arrangement SKOS Editor © 2026 by Jessica Talisman is licensed under
[Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0)](https://creativecommons.org/licenses/by-nd/4.0/).
See [LICENSE](LICENSE).

This covers the editor and the example taxonomy shipped with it. Taxonomies and
ontologies **you** create with the tool are your own — the tool does not apply
this license to your work.
