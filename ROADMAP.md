# Roadmap

What's shipped, what's in progress, and what's planned for the Intentional Arrangement SKOS editor. Priorities are shaped by hands-on user feedback — see **[how to request a feature or report a bug](#feedback--requests)** at the bottom.

Legend: ✅ Shipped · 🚧 In progress · 🔜 Next · 💡 Planned

---

## ✅ Recently shipped

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

## 🔜 Next

Nothing in active development right now — the **Planned** items below are candidates, and your requests shape the order. See [how to request a feature](#feedback--requests).

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
