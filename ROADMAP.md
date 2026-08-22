# Roadmap

What's shipped, what's in progress, and what's planned for the Intentional Arrangement SKOS editor. Priorities are shaped by hands-on user feedback — see **[how to request a feature or report a bug](#feedback--requests)** at the bottom.

Legend: ✅ Shipped · 🚧 In progress · 🔜 Next · 💡 Planned

---

## ✅ Recently shipped

### Collections/Sources UI + editor navigation (#28, #29, #30)
- Collections tab reframed as two cards (list + editor) matching the Build layout (#28); the Sources tab label and panel heading no longer collapse in Firefox (#30); relationship chips and collection members are now click-to-navigate — jump straight to the concept in the tree (#29).

### ISO 25964 relations, rdfs:label/comment, and a Sources tab (#25)
- **ISO 25964 thesaurus relations** (opt-in): `iso-thes:broaderGeneric` / `broaderPartitive` / `broaderInstantial` (+ narrower inverses), toggled per taxonomy; generic & instantial also assert `skos:broader`.
- **`rdfs:label`** (alternate name) and **`rdfs:comment`** on concepts.
- **Sources tab** — reusable `foaf:Document` records (`dct:title`, `foaf:page`, `rdfs:comment`) cited by concepts via `dct:source`, and `prov:Agent` records (`prov:Person`/`Organization`/`SoftwareAgent` with `foaf:name`/`foaf:homepage`) creditable as the scheme's creator / contributor / publisher.
- All of it round-trips in Turtle, RDF/XML, and JSON-LD. (International standards only — no country-specific profile.)

### Collections tree UX (#24)
- Collapsible/expandable collection nodes with a large caret (expanded by default), a green ● marking each collection (replacing the set/sub-collection tags; ordered keeps a badge), and the filter/highlight from before. The left-list + right-editor split was already in place.

### v0.7.0 — standards fixes & display options (from GitHub issues #16–#22)
- **RDF/XML import** — the importer now reads RDF/XML (`rdf:Description`, typed nodes, `rdf:about`/`ID`/`nodeID`, `xml:lang`, `rdf:datatype`, `xml:base`), so `.rdf`/`.xml` files load and the app's own RDF/XML export round-trips. (#18)
- **SKOS-XL export toggle** — a checkbox in the Export dialog puts `skosxl:Label` resources in every download (Turtle, RDF/XML, JSON-LD), defaulted on for SKOS-XL projects.
- **`skos:related` is symmetric** — adding or removing a related term mirrors the inverse and shows in the graph. (#22)
- **`dcterms:modified`** updates on every change; **`dcterms:language`** is exported and read back on import (with the file's own default language detected). (#20, #21)
- **Tree & picker display options** — show nodes by label / qualified name / full IRI, pick the display language, and sort document / A–Z / Z–A. (#16)
- **Filter highlighting** — matches are highlighted in the concept tree and the Collections tree. (#17)
- **Collections: hierarchy + filter** — a collection's concept members arrange by their own broader/narrower (ordered collections keep their sequence), with a filter box that highlights members. (#5, extended)
- **Clearer imports** — a ConceptScheme titled with `skos:prefLabel` fills the title; failed/empty imports say why instead of failing silently.

### earlier
- **SKOS-XL build mode** — a per-taxonomy **Label style** choice (Plain SKOS vs **SKOS-XL**) in the concept-scheme panel, with an *XL* badge when it's on. In SKOS-XL mode every label becomes a `skosxl:Label` resource with its own URI and an optional **source / provenance** (`dcterms:source`) you can record per label; exports default to SKOS-XL + plain, and imports of SKOS-XL round-trip the URI and source back in.
- **Glossary (on-ramp)** — a staging bucket for **candidate terms**, the first tab because it comes before building. Import a flat list from paste, a text/markdown file (bullets, numbering, headings), CSV, or `.xlsx`; keep a list **unlinked** or associate it with a taxonomy; then **promote** terms into that taxonomy as SKOS top concepts you can arrange. Matches how people actually start — collect first, structure later.
- **Workspace & onboarding** — optional local passcode (per-browser lock, salted hash, not encryption), a welcome screen to open or start a taxonomy, and guided new-project setup with Dublin Core metadata (title required; created/published/modified auto-filled).
- **Autosave** — every change persists to the browser, with a visible "✓ Saved" indicator.
- **Spreadsheet import & export** — CSV and Excel `.xlsx`, both round-tripping, unzipped/zipped in the browser (no library, no upload). [Template](docs/templates/skos-import-template.xlsx) + [tutorial](docs/spreadsheet-import.md).
- **Safe imports** — an import asks where it should go: **Create a new project** (default; your other projects are untouched) or **Merge into the current project** (adds concepts, never overwrites). A post-import health check reports top concepts and warns on orphans or a flat/disconnected hierarchy (a `broader` column that didn't match).
- **Editor quality-of-life** — trim empty labels automatically; **set the identifier from the label** in one click; a warning when two concepts have near-identical identifiers; a **"last checked · Manual/Automatic"** indicator on the validator.
- **Proposals** — readers can *propose* a new term (with definition, suggested parent, synonyms, scope note, rationale, and links); a taxonomist reviews each in the Proposals tab and approves it into the vocabulary or rejects it.
- **Documentation hub** — a single [docs home](docs/) covering install, using the editor, the workspace, spreadsheet import, the SKOS reference, and the REST API + MCP server — linked from inside the app.
- **Guided first-build walkthrough** — a skippable, 11-step tour with tooltips that spotlights the build flow (top concepts, the tree, identifier vs. label and UUIDs, top vs. child, labels, definitions, linked data, validate/export). Auto-starts once; reopen anytime from the ☰ menu.
- **Hamburger menu** — one **☰** menu that mirrors the tabs and gathers the documentation, feedback (feature request / bug report / email), and the tour in a single place.

## 🚧 In progress

- **Schema Binding — projection & mapping.** A shared, app-neutral engine ([`lib/schema-projection.js`](lib/schema-projection.js)) that projects the ontology model onto implementation targets and maps them back, through an **editable projection map**. Targets: **MongoDB** (`$jsonSchema`), **GraphQL** (SDL), **SwiftData** (`@Model`), **Obsidian** (frontmatter). The engine is built and tested (project-out for all four, round-trip for the three importable ones); **next** is the in-app "Project schema" panel and the per-app IR adapters.

## 💡 Planned

- **Schema Binding / projection export and import** — export or import the model (and a "projection map") toward implementation targets: Pydantic, SwiftData, Cypher/neosemantics, MongoDB, Obsidian properties.
- **Import diagnostics, deepened** — an inline report (not just a toast) after import/merge.
- **Validation** — a persistent "edited since last check" state and clearer manual/automatic explanation.

---

## Feedback & requests

Ideas and bugs are welcome and genuinely shape this list.

- **Request a feature** → [open a feature request](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml)
- **Report a bug** → [open a bug report](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml)
- **Prefer email?** → Hello@ontologypipeline.com

Browse the [existing issues](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues) first — a 👍 on one that matches helps it rise.
