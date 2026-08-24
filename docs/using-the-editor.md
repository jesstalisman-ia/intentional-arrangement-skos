# Using the editor

A walk through the editor, tab by tab, from a blank project to a taxonomy you can hand off. If you haven't opened the tool yet, start with the [install guide](install.md); for the login, projects, and autosave, see [your workspace](workspace.md).

The app has eight tabs, each with its own accent color: **Glossary**, **Build**, **Business view**, **Proposals**, **Graph**, **Validate**, **SPARQL**, and **Export**. You collect raw terms in Glossary, author in Build, gather suggestions in Proposals, check your work in Validate, read it in Business view, see its shape in Graph, query it in SPARQL, and take it out in Export.

## Start a project

From the welcome screen, open a taxonomy you're working on or start a new one. A new project asks for its [Dublin Core metadata](workspace.md#starting-a-project-with-dublin-core-metadata) — a title is the only required field. Every change saves to your browser on its own; there's no save button to remember.

## Glossary — start with candidate terms

Structure rarely comes first. The **Glossary** tab (the first one, because it comes before building) is a staging bucket for raw **candidate terms** — a garage for words you've collected but haven't organized yet.

- **Bring terms in, low-friction.** Paste them one per line, or as a markdown list (`- term`, numbered, or headings), or as CSV (`term, note`); or import a text, markdown, CSV, or Excel `.xlsx` file. Duplicates are skipped.
- **Keep lists loose or linked.** A candidate list can sit **unlinked**, or you can associate it with a taxonomy. Give each collection its own list — one per source, one per project, however you work.
- **Promote when ready.** Promote a term into the linked taxonomy as a SKOS concept — either as a **top concept** or **placed under a parent you choose** from that taxonomy (there's a per-term parent picker, and a shared "promote all under…" selector). Promoted terms are checked off so you can see what's left.

The point is to lower the barrier to starting: collect first, structure later.

## Build — author your concepts

The Build tab is where the work happens. The tree of concepts sits on the left; the editor for the selected concept sits on the right.

### Grow the hierarchy

- **Add a top concept** with the button above the tree. A top concept sits at the root — it has no parent.
- **Add a child** to build depth. A child points up to its parent through `broader`.
- Select any concept in the tree to edit it. Drag or use the concept's own fields to change where it sits.

**Jump to a related concept.** In a concept's **Broader**, **Related**, or ISO 25964 pickers, click a linked concept to jump straight to it in the tree (it expands and scrolls into view). The same works for concept members in the Collections editor.

**ISO 25964 relations (opt-in).** In the concept-scheme panel, turn on **ISO 25964 relations** to add three specialised broader pickers to the concept editor alongside plain `skos:broader`: **generic** (is-a, `iso-thes:broaderGeneric`), **partitive** (part-of, `iso-thes:broaderPartitive`), and **instantial** (instance-of, `iso-thes:broaderInstantial`). On export, generic and instantial also assert `skos:broader` so plain-SKOS tools still see the hierarchy; partitive is emitted as `iso-thes` only. Leave the toggle off and the editor stays plain SKOS.

### A concept's fields

**Identifier vs. preferred label.** These are two different things, and keeping them straight saves pain later:

- The **identifier** (the URI fragment) is the concept's identity. It stays fixed even when you rename the label.
- The **preferred label** is what people read. Changing it does *not* change the identifier.

Because they can drift apart, the editor gives you help: **↦ from label** sets the identifier from the current preferred label, **⟳ UUID** assigns an opaque, stable identifier, and a warning appears if two concepts end up with near-identical identifiers (for example `MonthJournal` and `Monthjournal`, which are two different concepts).

**Labels.**

- **Preferred label** — one per language. This is the concept's headline term.
- **Alternative labels** — synonyms and accepted variants.
- **Hidden labels** — terms you want found in search but not shown, such as common misspellings or retired names.

Each label carries a language tag, chosen from a **dropdown** rather than typed. The supported languages are the six the editor ships with — English (`en`), Dutch (`nl`), French (`fr`), Spanish (`es`), Portuguese (`pt`), and Finnish (`fi`) — using ISO 639-1 two-letter codes, which is what BCP 47 requires for RDF/SKOS language tags. If a label imported from elsewhere carries a tag outside that set, it's preserved and shown as "*code* · (other)" so nothing is silently rewritten. The same dropdown appears on definitions and notes. A whitespace-only label is trimmed when you leave the field, so an empty label doesn't quietly linger.

**Plain SKOS or SKOS-XL labels.** By default, labels are plain literals (`skos:prefLabel`, `skos:altLabel`, `skos:hiddenLabel`). Under **Concept scheme → Label style** you can switch a taxonomy to **SKOS-XL**, which turns every label into a first-class resource (`skosxl:Label`) with its own URI. In SKOS-XL mode each label in the editor gains two extra fields:

- a **label URI** (leave it blank to auto-generate one on export), and
- a **source / provenance** note (`dcterms:source`) — where that specific label came from.

When SKOS-XL is on, a teal **SKOS-XL** badge appears in the header (click it to jump to the setting), exports default to *SKOS-XL + plain* (so consumers that only understand plain SKOS still work), and importing SKOS-XL round-trips the label URIs and their sources back in. Use it when the provenance of individual terms matters — regulated vocabularies, multi-source glossaries, terms you need to attribute. If you don't need that, plain SKOS keeps things simpler.

**Notes.**

- **Definition** — what the concept means. This is where a vocabulary earns trust.
- **Scope notes** — how and when to use it, including any judgment calls (see the note on `broader` below).

**Structure.**

- **Broader** — the concept's parent(s). The tool supports poly-hierarchy, so a concept can sit under more than one parent.
- **Related** — an associative link to a concept that belongs alongside this one without being a parent or child.
- **Top concept** — mark the entry points at the top of the scheme.
- **Notation** — a code or classification number, if you use one.

> **A note on `broader`.** SKOS `broader` covers both "is a kind of" and, in practice, "is a part of." If you use it for containment — say, *Day* is part of *Week* rather than a kind of week — record that in a scope note so the distinction survives into anything you build downstream.

**Concept metadata (Dublin Core).** Each concept has its own Dublin Core fields — **Author** (`dcterms:creator`), **Created** (`dcterms:created`), **Published** (`dcterms:issued`), and **Modified** (`dcterms:modified`). Fill them per concept for governance; they export as typed Dublin Core in every RDF serialization and round-trip back on import.

**Mappings.** Link a concept to the same or a related concept in another vocabulary with the mapping properties: `exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`. Reserve `exactMatch` for concepts that are genuinely interchangeable.

**Linked artifacts.** Attach documents, images, or links that give a concept context for the people using it.

## Collections — alternative groupings

The **Collections** tab groups concepts into a `skos:Collection`, or an ordered `skos:OrderedCollection` whose member order is significant. Collections sit *beside* the broader/narrower hierarchy rather than inside it, and they nest — a collection can contain sub-collections, giving a second tree with concepts at the leaves.

Each node has a **green ● circle** marking a collection; an ordered one also carries an **ordered** badge. Click the large **▶ / ▼ caret** to collapse or expand a node — the tree is expanded by default. Inside a collection, concept members arrange by their own broader/narrower (an ordered collection keeps its `skos:memberList` sequence instead). The **filter box** narrows the tree to matching collections and members and highlights the hits. Select a collection to edit its name, note, type, and members in the panel on the right.

## Sources — documents & agents

The **Sources** tab holds reusable records that concepts and the scheme can point at.

- **Documents** (`foaf:Document`) — a source document with a title (`dct:title`), a page URL (`foaf:page`), and an optional comment (`rdfs:comment`). Add documents here, then cite them from a concept with the **Sources** picker in the concept editor (`dct:source`).
- **Agents** (`prov:Agent`) — a **Person**, **Organization**, or **Software agent** (`prov:Person` / `prov:Organization` / `prov:SoftwareAgent`) with a name (`foaf:name`) and optional homepage (`foaf:homepage`). In the concept-scheme panel, link an agent as the scheme's **creator**, **contributor**, or **publisher** — the agent reference is exported in place of the plain-text field.

Everything round-trips: documents, agents, `dct:source`, and the attribution references all export to RDF and read back on import.

## Proposals — suggest and review terms

Not everyone who has an idea for a term should edit the vocabulary directly. In the **Proposals** tab, contributors *propose* a new term — with a definition, a suggested parent, synonyms, a scope note, a rationale, and links — and a taxonomist reviews each one. The reviewer sets the proposed concept's parent (or makes it a top concept) and **approves** it into the taxonomy, or **rejects** it with a reason. Every decision is recorded, and the whole log downloads as CSV or a readable report.

## SPARQL — query the vocabulary

The **SPARQL** tab runs queries against your taxonomy entirely in the browser. It ships with a preseeded library of example queries, and a **natural-language** box that turns plain questions ("children of X", "concepts without a definition", "descendants of X") into SPARQL using an offline, rule-based generator — no server, no LLM, nothing leaves your machine. You can toggle whether SKOS-XL triples are included in what's queried.

## Validate — keep it sound

The Validate tab runs qSKOS-style quality checks. A vocabulary can be valid RDF and still be broken as a thesaurus, so this is where you catch that.

- **Manual or Automatic.** In Automatic mode the checks re-run a moment after each edit; in Manual mode you click **Run validation**. The indicator shows when it last checked and which mode you're in.
- **What it checks** — one preferred label per language, label disjointness, no cycles in the hierarchy, no orphans, `related`/`broader` clashes, undocumented concepts, and more. The full list, with what each means, is in the [SKOS reference](skos-reference.md#the-conditions-that-keep-it-sound).
- **One-click fixes.** For the mechanical problems, the tool offers to fix what it finds — it offers, it doesn't decide for you.

## Business view — for the people who read it

The Business view is a read-friendly browse of the vocabulary — breadcrumb, definition, synonyms, and place in the hierarchy — for the people who use the taxonomy but never edit it.

## Graph — see the network

Past a certain size, the value of a taxonomy lives in the network between terms, not in any single one. The Graph tab draws that network as a force-directed view, synced to the editor.

## Export — take it out without loss

Export from the **Export** tab (it's the last tab — it does more than RDF, so it's labelled just "Export"). The RDF forms are lossless; the flat forms are for people and other tools.

- **Turtle** — the readable default, lossless.
- **RDF/XML, JSON-LD, RDF/JSON** — the same content in other RDF serializations.
- **CSV, Excel (`.xlsx`)** — a flat, spreadsheet-friendly view. Good for editing and review; treat an RDF export as the version of record.
- **Markdown** — the vocabulary and its links as one readable document.

For the RDF forms you also choose the **label style** — *Plain SKOS*, *SKOS-XL*, or *SKOS-XL + plain*. If the taxonomy is in SKOS-XL mode (see [Labels](#a-concepts-fields)) this defaults to *SKOS-XL + plain*.

Everything is generated in your browser. Nothing is uploaded.

## Import — bring work in safely

Import (the **Import** button in the header) reads a SKOS taxonomy from RDF or a spreadsheet. It asks **where it should go**:

- **Create a new project** (default) — your other projects stay untouched.
- **Merge into the current project** — adds concepts to what you have, and never overwrites.

After an import, a short summary reports the concept count and top concepts, and warns if the result looks flat or disconnected — a sign a spreadsheet's `broader` column didn't match. For the spreadsheet format and a fill-in template, see [building a taxonomy in a spreadsheet](spreadsheet-import.md).

**Metadata round-trips losslessly.** Any metadata on a concept or the concept scheme that the editor doesn't have a dedicated field for — per-concept `dcterms:created`, `dcterms:issued`, `dcterms:modified`, `dcterms:creator`, ISO 25964 properties, or any other predicate — is preserved on import and re-emitted on export exactly as it came in (across Turtle, RDF/XML, and JSON-LD). Nothing you import is dropped when you export.

## Scheme metadata

Under **Concept scheme, identifiers & Dublin Core metadata** you set the vocabulary's own record: title, description, creator, publisher, the created/published/modified dates, rights, and language, plus the base namespace and whether identifiers are readable or UUIDs. This is also where the **Label style** (plain SKOS vs [SKOS-XL](#a-concepts-fields)) lives, and a one-click **Assign UUIDs to all terms**. This metadata travels with every export.

## Where your work lives

Projects, autosave, the optional passcode, and moving work between machines are covered in [your workspace](workspace.md). The short version: it's all in your browser, it saves itself, and you move it by exporting and importing.
