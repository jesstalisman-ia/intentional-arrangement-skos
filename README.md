# Intentional Arrangement SKOS

Build a real SKOS taxonomy in your browser. It validates as you type, exports to seven formats, and sticks to the standards a cataloguer would check it against. No account, no server — one HTML file you open and use.

**Try it:** https://jesstalisman-ia.github.io/intentional-arrangement-skos/
Or download `app/index.html` and open it from your desktop. That file is the app.

> Informed building, not blind building. Augmentation, not automation.

**Curious why it's built this way?** → [Why it works this way](docs/why-it-works-this-way.md) — the thinking behind running in the browser, the license, SKOS-XL, collections, and sharing.

📍 [Roadmap](ROADMAP.md) · 💬 [Discussions](https://github.com/jesstalisman-ia/intentional-arrangement-skos/discussions) (questions & ideas) · 💡 [Request a feature](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml) or [report a bug](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml)

---

## What's in the repo

| Folder | What it is |
|---|---|
| **`app/`** | The browser app — one self-contained `index.html`. |

| **`api/`** | A small REST API (Flask + rdflib + pySHACL) to validate a vocabulary and convert between RDF serializations. |

| **`mcp-server/`** | An MCP server exposing the same engine as tools, so an assistant like Claude can validate/convert/profile a vocabulary. |

| **`connectors/`** | Bridges that pull external vocabularies into the editor as SKOS. First one: **[SharePoint Term Store → SKOS](connectors/sharepoint-termstore/)** (Microsoft Graph or an offline export). Example/reference software — see its README's disclaimer before any live use. |

| **`deploy/`** | **Optional** Apache Jena Fuseki server for the app's "Publish to server" feature — a Dockerfile that builds Fuseki **5.6.0** from the official distribution (base image pinned by digest, tarball by SHA-512). **Not required; review [`deploy/README.md`](deploy/README.md) and harden before deploying.** |

| **`docs/`** | [Documentation hub](docs/): install, using the editor, workspace, spreadsheet import, SKOS reference, [hosting Fuseki](docs/hosting-fuseki.md), and the API/MCP guides. |

> **Where's Jena/Fuseki?** Fuseki is a separate Java server; `deploy/` builds it from the **official Apache distribution** (Jena 5.6.0, pinned by digest + checksum) for the *optional* "Publish to server" feature, with a hardening checklist. The app itself never needs it — it runs fully client-side.

## What the app does

- **Editor.** Concepts get URIs, one preferred label per language, alternate and hidden labels, an optional `rdfs:label` alternate name and `rdfs:comment`, and the run of SKOS notes: definition, scope, change, history, editorial, example. The hierarchy is real poly-hierarchy — a concept can sit under two parents. Adding a `skos:related` link is reciprocal, the way SKOS defines it (`owl:SymmetricProperty`) — it holds both ways and shows in the graph. Click a linked concept in any relationship picker to jump straight to it in the tree. Identifiers are readable or opaque UUIDs, your call. Language tags use BCP 47 / ISO 639.

- **ISO 25964 thesaurus relations** *(opt-in)*. Turn on ISO 25964 mode to get the specialised hierarchy alongside plain `skos:broader`: `iso-thes:broaderGeneric` (is-a), `broaderPartitive` (part-of), and `broaderInstantial` (instance-of), with their narrower inverses. Generic and instantial also assert their `skos:broader` super-property, so plain-SKOS tools still read the hierarchy.

- **Sources — documents & agents.** A **Sources** tab for reusable `foaf:Document` records (`dcterms:title`, `foaf:page`, `rdfs:comment`) that concepts cite with `dcterms:source`, and `prov:Agent` records — `prov:Person` / `prov:Organization` / `prov:SoftwareAgent` with `foaf:name`/`foaf:homepage` — that you can credit as the scheme's creator, contributor, or publisher.

- **Crosswalk (thesaurus building).** Align taxonomies from your workspace with the five SKOS mapping relations. Auto-match proposes links from identical/near labels; confirm or draw your own in a visual side-by-side view. Three exports, each in **Turtle, RDF/XML, or JSON-LD**: the crosswalk alone (mapping triples), the federated thesaurus (the current pair + mappings), or **the whole federation** — every taxonomy networked by mappings, in one file (available from the Crosswalk tab and from a dedicated card in the Export tab; step-by-step instructions in [Using the editor](docs/using-the-editor.md#exporting-the-federated-structure-step-by-step)). Mappings also ride along in normal exports.
- **Display & filter.** Show the concept tree by **label** (with a language picker when the vocabulary is multilingual), **qualified name**, or **full IRI**, in document order or A–Z / Z–A. The filter box highlights matches (and matches by whatever form you're showing). Both apply to the relationship pickers as well.

- **Collections.** Group concepts into a `skos:Collection`, or an ordered `skos:OrderedCollection` that keeps member order. Collections sit beside the broader/narrower tree instead of inside it, and they nest — a second tree with concepts at the leaves. Inside a collection, its concept members arrange by their own broader/narrower, and a filter box highlights members. An `OrderedCollection` keeps its `skos:memberList` sequence. Nodes collapse and expand (a green ● marks each collection, an *ordered* badge marks ordered ones).
  
- **SKOS-XL.** Turn on SKOS-XL for a taxonomy and every label becomes a `skosxl:Label` resource with its own URI and optional `dcterms:source` provenance. The **Export** dialog has a **SKOS-XL toggle** so every download carries the `skosxl:Label` resources (dumbed-down to plain `skos:` labels too) across Turtle, RDF/XML, and JSON-LD.
  
- **Business view.** A reading layout for the people who aren't taxonomists: breadcrumb, definition, synonyms, narrower terms. Copy a **read-only share link** and the taxonomy rides inside the link itself. Nothing gets uploaded.
  
- **Validate (qSKOS).** Quality checks run right in the edit loop — missing or duplicate preferred labels, label disjointness, related/broader conflicts, cyclic hierarchy, orphans, undocumented concepts — most with a one-click fix.
  
- **Import / export.** Out to Turtle, RDF/XML, JSON-LD, RDF/JSON, CSV, Excel `.xlsx`, and Markdown. In from any of those RDF syntaxes — **Turtle, RDF/XML, JSON-LD, RDF/JSON** — or a spreadsheet; the import reads the file's own default language (its `dcterms:language`, else the dominant label language) so new edits aren't mistagged, and you can still override per import, row, or cell. Excel is zipped and unzipped in the browser, no library and no upload. When a file has no SKOS concepts, the tool says why instead of failing silently.
  
- **Visualize.** A force-directed picture of the scheme, synced to the editor — and not just concepts: toggles add the **concept scheme** as a hub (click it for its Dublin Core metadata), **sources and agents** (`dcterms:source` citations, creator/contributor/publisher attributions), and **crosswalk mappings**, with concepts mapped from other taxonomies in your workspace drawn as labelled external bubbles. The federation you build in Crosswalk is visible as one network.
  
- **Scheme metadata.** Dublin Core for the concept scheme. `dcterms:created`/`issued`/`modified` fill themselves in, `dcterms:modified` updates on every change, and `dcterms:language` is written out and read back on import.
  
- **Publish to a server** *(optional)*. Connect an Apache Jena Fuseki dataset to store a taxonomy and share a short link that loads it back. See [hosting Fuseki](docs/hosting-fuseki.md).

## Your workspace

Several taxonomies at once, each autosaved to your browser with a **✓ Saved** tick. An optional per-browser passcode locks the workspace (salted SHA-256 in local storage — a convenience lock, not encryption; nothing leaves the machine). A welcome screen opens an existing taxonomy or starts a fresh one. New projects begin with guided Dublin Core setup where only the **title** is required. Open, rename, duplicate, and delete from the **Projects** button. Full walkthrough: [docs/workspace.md](docs/workspace.md).

## Three ways to use it

New here? Start with the **[Getting-started runbook](docs/getting-started.md)** — the fastest way in, what runs locally, and how the tool behaves hosted vs. as a local file. [Install & setup](docs/install.md) goes deeper on running it locally and deploying your own copy.

### 1. In your browser
Open `app/index.html`, or serve it:
```bash
cd app && python3 -m http.server 8080     # http://localhost:8080
```
It's also [live on GitHub Pages](https://jesstalisman-ia.github.io/intentional-arrangement-skos/).

### 2. As a REST API
```bash
cd api && pip install -r requirements.txt && python server.py     # http://127.0.0.1:8000
# validate a vocabulary
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' http://127.0.0.1:8000/validate
# convert Turtle -> JSON-LD
curl -X POST --data-binary @vocab.ttl -H 'Content-Type: text/turtle' 'http://127.0.0.1:8000/convert?to=json-ld'
```
See [`api/README.md`](api/README.md).

### 3. As an MCP server
```bash
cd mcp-server && pip install -r requirements.txt && python skos_mcp.py
```
Register it with an MCP client (Claude Desktop / Claude Code):
```json
{ "mcpServers": { "skos": { "command": "python", "args": ["/abs/path/mcp-server/skos_mcp.py"] } } }
```
Tools: `validate_skos`, `convert_skos`, `skos_profile`. See [`mcp-server/README.md`](mcp-server/README.md).

## Build it yourself

This repo is meant to be read and rebuilt, not just run. The essays in [`docs/`](docs/) show the how: assembling a SKOS "skill" from your own example files plus Z39.19, ISO 25964, and the W3C spec; modeling from what you have; the editor's capture-and-render choices; the business view; qSKOS; and the spreadsheet round-trip. [Why it works this way](docs/why-it-works-this-way.md) covers the why.

## Standards

- **W3C SKOS** — the RDF vocabulary for concept schemes.
- **ANSI/NISO Z39.19-2005** — controlled-vocabulary construction (term form, USE/UF, BT/NT/RT, scope notes).
- **ISO 25964-1/-2** — thesauri and interoperability; the `iso-thes` generic/partitive/instantial relations are available in ISO 25964 mode.
- **DCMI / Dublin Core** — concept-scheme metadata, `dcterms:source`, and attribution.
- **FOAF** (`foaf:Document`, `foaf:page`, `foaf:name`) and **PROV-O** (`prov:Person`/`Organization`/`SoftwareAgent`) — documents and agents in the Sources tab.
- Validation shapes: [`api/skos-shapes.ttl`](api/skos-shapes.ttl) (SHACL).

## Hosting

The app is live on GitHub Pages (repo **Settings → Pages → Source: GitHub Actions**). Because it's one static file, you can host a copy anywhere:

- **GitHub Pages** — free: fork, then **Settings → Pages → Source: GitHub Actions**. Lands at `https://<you>.github.io/intentional-arrangement-skos/`.
- **Netlify / Cloudflare Pages** — free, with a custom domain. `netlify.toml` points the publish directory at `app/`, so it imports in one click; then add a domain and a CNAME record at your registrar.

All data stays in the visitor's browser, so hosting shares the tool and never anyone's vocabularies.

## Roadmap & feedback

[ROADMAP.md](ROADMAP.md) tracks what's shipped, in progress, and planned. Ideas and bug reports shape that list — several recent releases came straight from the community.

- **Ask a question / share an idea** → [Discussions](https://github.com/jesstalisman-ia/intentional-arrangement-skos/discussions) — Q&A, Ideas, Show and tell
- **Request a feature** → [feature request](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml)
- **Report a bug** → [bug report](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml)
- **Prefer email?** → Hello@ontologypipeline.com

Rule of thumb: **Discussions** for how-to questions and half-formed ideas, **Issues** for concrete bugs and feature requests. Browse [existing issues](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues) first — a 👍 on one that fits helps it rise.

## Cloud workspace — paid tier in the works

The editor you're using stays free and full-featured. We're gauging interest in a **low-cost paid tier** that adds the platform around it: **cloud storage and sync** (your vocabularies follow you to any machine), **a private graph database per account** (isolated, versioned, append-only history), an **AI taxonomy copilot** (propose-and-accept drafting with provenance, bring-your-own Anthropic key), **federated projects** (a crosswalk pair as one editable multi-namespace project), and a **guided workflow**. Standard RDF in and out everywhere — leaving is always one export away.

**[Vote in the interest poll](https://github.com/jesstalisman-ia/intentional-arrangement-skos/discussions/49)** or **join the waitlist**: email [Hello@ontologypipeline.com](mailto:Hello@ontologypipeline.com?subject=Cloud%20workspace%20waitlist) with subject "Cloud workspace waitlist" — waitlist members get the first beta invites, free during beta.

## License

Intentional Arrangement SKOS Editor © 2026 Contextually LLC (d/b/a Ontology Pipeline), under a **size-based source-available license** (see [LICENSE](LICENSE) and [NOTICE](NOTICE)):

- **Organizations with fewer than 75 total employees** may use, modify, and redistribute it for free under the **Apache License 2.0**, as modified by the Size-Based Licensing Notice.
- **Organizations with 75 or more total employees** must obtain a **written enterprise license** from the Licensor (Hello@ontologypipeline.com) before any use.

This is a source-available license, **not** an OSI-approved open-source license. It covers the editor and its example taxonomy. Taxonomies you create with the tool are your own — the license doesn't touch your work product.
