# Roadmap

What's shipped, what's in progress, and what's planned for the Intentional Arrangement SKOS editor. Priorities are shaped by hands-on user feedback — see **[how to request a feature or report a bug](#feedback--requests)** at the bottom.

Legend: ✅ Shipped · 🚧 In progress · 🔜 Next · 💡 Planned

---

## ✅ Recently shipped

### Multiple contributors (v0.16.0, #50)
- Scheme attribution now takes **any number of contributors**: a chip-style picker replaces the single Contributor dropdown, and the export emits one `dcterms:contributor` triple per agent — DCMI practice, no workaround vocabulary needed (Dublin Core properties repeat freely in RDF). Identity URIs are honored, so a contributor with an ORCID exports as `dcterms:contributor <https://orcid.org/…>`. Creator and Publisher stay single-valued by convention.
- The importer now collects **all** `dcterms:contributor` statements instead of keeping only the last one — a silent lossless-round-trip gap this ticket surfaced. Existing projects migrate their single contributor automatically; agent renames and deletions cascade through the list; the graph draws one attribution edge per contributor.

### Multi-namespace fidelity + a clear Crosswalk export (v0.15.0)
- **Foreign URIs survive.** Importing a federated file (two or more taxonomies, several namespaces) no longer re-mints the other taxonomy's URIs under your base: concepts from another namespace keep their **original URIs** on export, their own scheme membership, and their own concept scheme (typed and titled) — verified byte-faithful across repeated round-trips, including local-name collisions across namespaces. This is the foundation for true federation work.
- **One clear Export control on the Crosswalk tab.** The three scattered export buttons are replaced by a single row: a **scope picker** that says exactly what goes in the file with live counts — *Mappings only (N links)* · *This pair as one thesaurus (A + B)* · *Whole federation (K taxonomies)* — a format picker, a **SKOS-XL labels** option, and a plain-language summary sentence of the file's contents. Mappings-only is now strictly pair-scoped: it contains the links between the chosen pair, nothing else.
- **Auto-match is dismissable and reversible.** The suggestions panel gains **✕ Dismiss** (close without adding anything), and the workspace gains **Remove all pair mappings…** (with confirmation) to undo a bad auto-match in one step. Download toasts state exactly what was written.

### Saved crosswalks — name a pairing, switch between them (v0.14.0)
- The Crosswalk tab gains a **Saved crosswalks** row: save the current source ⇄ target pairing under a name, reopen it from the dropdown anytime, and remove it when done (the mappings themselves always stay on your concepts — a saved crosswalk is a view, not a copy). The last crosswalk you worked in restores automatically when you come back, and saved views whose taxonomies were deleted prune themselves.

### Publication metadata on the concept scheme — license, version, vann (v0.13.0, #45 #46 #47)
- The concept scheme's metadata panel gains **License** (`dcterms:license`, a URI — with the URI guard attached, so a lookalike or typo is caught) and **Version** (`owl:versionInfo`). Both export in every RDF serialization and read back on import, alongside the existing `dcterms:rights` text field (a rights *statement* and a license *URI* are complementary — the editor now carries both).
- Exports now annotate the scheme with **`vann:preferredNamespacePrefix`** and **`vann:preferredNamespaceUri`**, derived automatically from the workspace's own namespace and prefix — no new fields to fill in; the editor already knew both.

### Editor ergonomics & workspace safety (v0.12.0, #40 #41 #42 #43 #44)
- **Search in the relationship pickers** (#40) — every Broader/Related picker (ISO 25964 variants included) has a type-to-filter box; Enter takes the first match. The tree's "Document" sort is now labelled **Document order** with an explanation, and the Notation field says what it's for (`skos:notation`, an optional classification code).
- **Workspace safety** (#41) — the ☰ menu gains a **Your data** section: one-click **workspace backup** (every project and glossary in one JSON file) and **restore** (adds what's missing, never overwrites — a project that's newer in the backup restores beside yours). The editor asks the browser for **persistent storage** so an update is less likely to evict your work, warns when it's open in **two tabs**, detects when *another* tab saved and offers reload-instead-of-overwrite, and nudges after 60+ changes in a session.
- **Expand / collapse all** (#42) — two buttons on the tree options row: see the whole hierarchy, or fold back to top concepts.
- **External-vocabulary mappings, findable and guarded** (#43) — the concept editor's *External mappings* group (for `pkmv:Concept → skos:Concept`-style mappings) now takes CURIEs (`skos:Concept` expands) with full URI validation, and the Crosswalk tab points to it.
- **Concept identifiers derive from the label by default** (#44) — while an identifier still looks auto-generated (`NewConcept…`, or a `…Copy2` from Duplicate) it re-derives from the first preferred label; once you set one by hand it never moves (ISO 25964 persistence). Identifier renames now cascade *everywhere* — ISO 25964 broader variants, collection membership, graph positions, and glossary promotions included, closing a long-standing gap.

### URI input protection — parse check, CURIE expansion, lookalike hints (v0.11.1, #39)
- Every field that takes a raw URI (linked artifacts on concepts and proposals, document page URL and URI, agent homepage and identity URI) now guards its input — all offline, no network calls. Three layers: a **parse check** flags strings that aren't URLs at all (`https://skos:org#Concept`); **CURIE expansion** lets you type a vocabulary term like `skos:Concept` or `dcterms:title` and expands it to the full canonical URI from the editor's namespace table; and a **lookalike hint** catches plausible-but-wrong vocabulary hosts (`https://skos.org#Concept`) and offers the real namespace (`http://www.w3.org/2004/02/skos/core#Concept`) with one click. Warnings never block or discard what you typed — the editor protects, the taxonomist decides.

### Readable, stable identifiers for collections, documents & agents — and real identity URIs (v0.11.0, #35 #37)
- **No more `collection2` / `agent1` / `doc3` URIs.** Collections, source documents, and agents now get **label-derived identifiers**: name a new collection "Day Collection" and its URI local name derives automatically; same for a document's title and an agent's name. Each also has an editable **Identifier** field with a "↦ from name/title" sync — so you can choose your own form (e.g. `DayCollection`). Following ISO 25964's identifier-persistence rule, identifiers derive once and then stay stable: relabeling never silently changes a URI, and an explicit identifier change cascades through every reference (collection membership, concept `dcterms:source` citations, and the scheme's creator/contributor/publisher).
- **Agents and documents can carry real URIs.** An optional **Identity URI** on each agent (ORCID, ROR, a homepage URI) is used as the agent's subject on export — so `dcterms:creator <https://orcid.org/…>` instead of a minted local name — still typed `prov:Person`/`Organization`/`SoftwareAgent` with `foaf:name`. Documents get the same (a DOI or w3id as the document's URI, used in `dcterms:source` citations). External URIs round-trip on import.
- Uniqueness is now checked across the whole namespace (concepts, collections, documents, agents share it), closing a latent URI-collision gap.

### Fix: UI said `dct:source`, exports say `dcterms:source` (v0.10.1, #36)
- The Sources tab, the concept editor's Sources group label, the empty state, and the guided tour all referred to Dublin Core Terms with the informal `dct:` abbreviation, while every export declares (and has always used) the `dcterms:` prefix. All user-facing text — app, README, and docs — now says `dcterms:source` / `dcterms:title`, matching the declared prefix. Cosmetic only; no serialization changed.

### Graph shows the whole project — scheme, sources, crosswalk (v0.10.0)
- The Graph tab now draws more than concepts. Three new toggles add: the **concept scheme** as a gold hub linked to its top concepts — click it to read the scheme's full Dublin Core metadata in the inspector; **sources and agents** — `foaf:Document` records cited via `dcterms:source` and the `prov:Agent` creator/contributor/publisher attributions, with labelled edges; and **crosswalk mappings** — all five SKOS mapping relations in pink, with concepts mapped from *other* taxonomies in the workspace drawn as dashed external bubbles carrying their own preferred label and home taxonomy. Selecting a mapping edge shows the relation and can remove it; every new bubble's inspector links to the tab that manages it. The legend covers all seven bubble types.

### Crosswalk — federate taxonomies into a thesaurus (v0.9.0–v0.9.1)
- A new **Crosswalk** tab aligns two taxonomies from your workspace with the five SKOS mapping relations (`exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`). **Auto-match by label** proposes links (identical labels → `exactMatch`, near labels → `closeMatch`); confirm the ones you want or draw your own in the visual view (click source, click target). Mappings are stored on the source concepts, so they flow into every normal RDF export — and you can export the **crosswalk alone** (mapping triples), the **federated thesaurus** (the current pair + mappings), or — v0.9.1 — **the whole federation**: every taxonomy in the workspace networked by mappings, in one file. All three exports come in **Turtle, RDF/XML, or JSON-LD** via a format picker. First-run niceties: the empty state seeds four sample taxonomies to try, and with exactly two taxonomies the target auto-selects.

### Per-concept Dublin Core metadata + lossless round-trip (v0.8.2)
- **Every concept now has editable Dublin Core fields** — Author (`dcterms:creator`), Created (`dcterms:created`), Published (`dcterms:issued`), and Modified (`dcterms:modified`) — in a *Concept metadata* group in the editor. They're captured on import, editable per concept, and exported as typed Dublin Core across Turtle, RDF/XML, and JSON-LD. **`created` and `modified` auto-stamp**: both are set when a concept is created, and `modified` bumps to today whenever the concept is edited (editing the metadata fields by hand still sticks).
- **Nothing else is dropped either.** Any other predicate on a concept or the concept scheme that the editor doesn't model (ISO 25964, `dcterms:license`, `dcterms:subject`, custom metadata) is **preserved on import and re-emitted verbatim** on export — a lossless round-trip. This fixes the earlier silent loss of per-concept metadata.
- **Ingest stamps every concept.** On import/merge, any concept that arrives without Dublin Core dates gets `created`/`issued`/`modified` set to the ingest date, and `creator` set to the vocabulary's creator (who) — so **every concept carries created, published, and modified**, without overwriting metadata that came in the file. Importing a vocabulary with scheme metadata now **auto-expands the "Concept scheme … Dublin Core metadata" section** so it's visible instead of hidden in a collapsed panel. Existing projects (created before these fields) are migrated on load — every concept is back-filled from the scheme's date and creator — so the metadata populates on **every concept in every project**.

### Fix: deleting a concept was broken (v0.8.1)
- Deleting a concept (single or bulk) threw a scope error and never persisted — the concept came back on reload. The ISO 25964 field list the delete paths cleaned lived inside the `Core` module and wasn't visible to the UI script. It's now exported from `Core` as one source of truth (`ISO_BROADER`/`ISO_INVERSE`/`ISO_ENTAILS_SKOS`), so the delete paths, the entailment de-dup, and cycle detection all read the same list and can't drift.
- Deleting a concept that a glossary term was promoted into now returns that term to the candidate pool instead of leaving it stuck as "promoted" pointing at a concept that no longer exists.

### Collections/Sources UI + editor navigation (#28, #29, #30)
- Collections tab reframed as two cards (list + editor) matching the Build layout (#28); the Sources tab label and panel heading no longer collapse in Firefox (#30); relationship chips and collection members are now click-to-navigate — jump straight to the concept in the tree (#29).

### ISO 25964 relations, rdfs:label/comment, and a Sources tab (#25)
- **ISO 25964 thesaurus relations** (opt-in): `iso-thes:broaderGeneric` / `broaderPartitive` / `broaderInstantial` (+ narrower inverses), toggled per taxonomy; generic & instantial also assert `skos:broader`.
- **`rdfs:label`** (alternate name) and **`rdfs:comment`** on concepts.
- **Sources tab** — reusable `foaf:Document` records (`dcterms:title`, `foaf:page`, `rdfs:comment`) cited by concepts via `dcterms:source`, and `prov:Agent` records (`prov:Person`/`Organization`/`SoftwareAgent` with `foaf:name`/`foaf:homepage`) creditable as the scheme's creator / contributor / publisher.
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
