# The guided walkthrough

This is the written companion to the **in-app tour** — the skippable, step-by-step walkthrough that starts the first time you open the editor (and that you can reopen anytime from the **☰** menu → *Help → Take a quick tour*). Each heading below matches a step in that tour, in the same order, and expands on it: what the step shows, why it matters, and how to get it right.

If you'd rather read the tool tab-by-tab instead of step-by-step, see [Using the editor](using-the-editor.md). For the SKOS constructs themselves, see the [SKOS reference](skos-reference.md).

> **The whole arc.** You'll collect raw terms in the Glossary, promote them into a tree, give each concept the fields that make it trustworthy (labels, a definition, its place in the hierarchy), record the vocabulary's own metadata, choose how labels are serialized, optionally take in proposals from others, then validate and export. The tour is ~14 substantive steps; this document follows them one to one.

---

## 1. Start with a glossary of candidate terms

*In the tour: "Glossary — start with candidate terms."*

Structure rarely comes first. Before you can decide what's broader than what, you usually just have a pile of words. The **Glossary** tab (the first tab, because it comes before building) is where that pile lives — a staging area for **candidate terms** that aren't organized yet.

### Getting terms in
Bring terms in with as little friction as possible:
- **Paste** them, one per line.
- Paste a **markdown list** — bullets (`- term`), numbered lists, or headings.
- Paste **CSV** as `term, note`.
- **Import a file** — `.txt`, `.md`, `.csv`, or Excel `.xlsx`.

Duplicates are skipped automatically, so you can paste overlapping lists without cleaning them first.

### Lists and their state
Each candidate list can sit **unlinked** (just a bucket), or be **linked to a taxonomy**. Keep one list per source, per project, or per session — however you actually collect. Nothing here is structured yet; that's the point.

### Promoting a term
When a term is ready to become real, **promote** it into the linked taxonomy as a SKOS concept — either as a **top concept**, or **placed under a parent you choose** (there's a per-term parent picker, and a shared "promote all under…" selector for doing many at once). Promoted terms are checked off so you can see what's left to place.

> **Why start here.** The barrier to a good vocabulary is usually *starting*. Collecting first and structuring later means you never lose a term just because you didn't yet know where it belonged.

---

## 2. Start with a top concept

*In the tour: "Start with a top concept."*

When you're ready to give terms a shape, switch to **Build**. Add your first concept with the **+ Top concept** button above the tree. A **top concept** sits at the root of the scheme — it has no parent. Most taxonomies have a handful of these: the top-level facets or themes everything else hangs under.

---

## 3. Your concept tree

*In the tour: "Your concept tree."*

Concepts form a tree on the left of the Build tab. **Select** any concept to edit it in the panel on the right. **Add children** under a concept to build depth — a child points up to its parent through `skos:broader`. The tree is where you see and reshape the hierarchy; the editor is where you fill each concept in.

---

## 4. A concept's identity vs. its label

*In the tour: "Identity vs. label."*

This is the distinction that saves the most pain later. Every concept has two separate things:

- an **identifier** (its URI fragment) — the concept's *identity*, which stays fixed even when you rename it, and
- a **preferred label** — the human-readable term, which you can change freely.

They can drift apart (you rename the label but the identifier keeps the old text), and that's fine — but the editor gives you tools to manage it:

### ↦ from label
Sets the identifier from the current preferred label — handy right when you create a concept, before anything points at it.

### ⟳ UUID
Assigns an opaque, stable identifier that never needs renaming. Good for concepts whose labels are still in flux, or anything you'll publish.

A warning appears if two concepts end up with near-identical identifiers (for example `MonthJournal` and `Monthjournal`), because those are two *different* concepts and the collision is almost always a mistake.

---

## 5. Top concept vs. child

*In the tour: "Top concept vs. child."*

A concept with **no `broader` parent** is a **top concept** — there's a "Top concept" toggle in the id row to mark it. Give a concept a **Broader** parent and it becomes a **child**, nested under that parent in the tree. The tool supports **poly-hierarchy**: a concept can have more than one parent when it genuinely belongs in two places.

> **A note on `broader`.** SKOS `broader` covers both "is a kind of" and, in practice, "is a part of." If you use it for containment — *Day* is part of *Week*, not a kind of week — say so in a scope note (step 8) so the distinction survives downstream.

---

## 6. Preferred label

*In the tour: "Preferred label."*

The **preferred label** is the concept's headline term — the one people read. There is **exactly one per language** (`en`, `fr`, …), set with `skos:prefLabel`. This is the single most-seen piece of a concept, so make it the clearest, most conventional term for the thing.

---

## 7. Alternative labels

*In the tour: "Alternative labels."*

**Alternative labels** (`skos:altLabel`) are synonyms and accepted variants — other true names for the same concept. They make the vocabulary findable without competing with the preferred label. (There are also **hidden labels**, `skos:hiddenLabel`, for terms you want matched in search but never shown — misspellings, retired forms.) The three label kinds must stay disjoint: a string can't be both a preferred and an alternative label on the same concept.

---

## 8. Definition

*In the tour: "Definition."*

Write what the concept **means** (`skos:definition`). This is where a vocabulary earns trust: a clear definition is what lets two people use a term the same way. Pair it with a **scope note** (`skos:scopeNote`) for guidance on *how and when* to apply the concept — including any judgment calls, like the `broader`-as-containment note above.

---

## 9. Linked data — artifacts and mappings

*In the tour: "Linked data."*

Two ways to connect a concept outward:

### Linked artifacts
Attach documents, images, or links (`rdfs:seeAlso`) that give the concept context for the people using it.

### Mappings
Connect a concept to the same or a related concept in **another vocabulary** with the mapping properties: `skos:exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`. Reserve `exactMatch` for concepts that are genuinely interchangeable — it's a strong claim. Mappings are what turn a standalone taxonomy into part of the wider web of data.

---

## 10. Concept scheme & Dublin Core metadata

*In the tour: "Concept scheme & Dublin Core."*

A vocabulary should have its own record, not just its concepts. Open **Concept scheme, identifiers & Dublin Core metadata** to set the scheme's **title, description, creator, publisher, the created / published / modified dates, rights, and language**, plus the **base namespace** and **prefix**. A title is the only thing required. This [Dublin Core](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) metadata travels with every export, so anyone who receives the file knows what it is, who made it, and under what terms.

---

## 11. UUIDs for every concept, in one click

*In the tour: "UUIDs for every concept — in one click."*

In that same section is **Assign UUIDs to all terms** — one click switches *every* concept to a stable, opaque UUID identifier at once. UUIDs never collide and never need renaming when labels change, which makes them ideal right before you publish or hand the vocabulary off. (You can also set the identifier style for *new* concepts to readable text or UUID here.)

---

## 12. Plain SKOS or SKOS-XL labels

*In the tour: "Plain SKOS or SKOS-XL labels."*

Also in the scheme panel is **Label style**, a per-taxonomy choice:

- **Plain SKOS** — labels are literals (`skos:prefLabel` and friends). Simple, and right for most vocabularies.
- **SKOS-XL** — each label becomes its own resource (`skosxl:Label`) with a **URI**, so you can record metadata *about the label itself* — most usefully a **source / provenance** (`dcterms:source`) for where that specific term came from.

Turn SKOS-XL on and a teal **SKOS-XL** badge appears in the header (click it to jump back to the setting); each label in the editor gains a URI field and a source field; and exports default to **SKOS-XL + plain** so consumers that only read plain SKOS still work. Importing SKOS-XL rounds the label URIs and sources back in. Reach for it when the origin of individual terms matters — regulated or multi-source vocabularies; otherwise plain SKOS keeps things simpler. See the [SKOS reference](skos-reference.md) for the underlying model.

---

## 13. Proposals — suggest and review terms

*In the tour: "Proposals — suggest & review terms."*

Not everyone who has an idea for a term should edit the vocabulary directly. In the **Proposals** tab, contributors *propose* a new term — with a definition, a suggested parent, synonyms, a scope note, a rationale, and links — and a taxonomist **reviews** each one:

- set the proposed concept's parent (or make it a top concept), then
- **approve** it into the taxonomy, or **reject** it with a reason.

Every decision is recorded, and the whole log downloads as CSV or a readable report — so the vocabulary can grow from many contributors while a single editor keeps it coherent.

---

## 14. Validate and export

*In the tour: "Validate and export."*

The last two moves turn a draft into something you can trust and hand off.

### Validate
The **Validate** tab runs qSKOS-style quality checks — one preferred label per language, disjoint label sets, no cycles in the hierarchy, no orphans, `related`/`broader` clashes, undocumented concepts, and more. A vocabulary can be valid RDF and still be broken as a thesaurus; this is where you catch that. Run it manually or let it re-check automatically after each edit, and take the **one-click fixes** for the mechanical problems (it offers, it doesn't decide for you). The full list of checks is in the [SKOS reference](skos-reference.md#the-conditions-that-keep-it-sound).

### Export
The **Export** tab takes the vocabulary out, losslessly in RDF or flat for people and tools:
- **Turtle** — the readable, lossless default.
- **RDF/XML, JSON-LD, RDF/JSON** — the same content, other serializations.
- **CSV, Excel** — a spreadsheet-friendly view for editing and review.
- **Markdown** — the vocabulary as one readable document.

For the RDF forms you also pick the **label style** (Plain SKOS, SKOS-XL, or SKOS-XL + plain — see step 12). Everything is generated in your browser; nothing is uploaded.

---

## You're set

*In the tour: "You're set."*

That's the arc: **collect → structure → describe → govern → validate → export.** Reopen this tour anytime from the **☰** menu, and when you want to bring existing work in, use **Import** — it asks whether to open the file as a new project or merge it into the current one, and runs a health check afterward (see [Using the editor](using-the-editor.md#import--bring-work-in-safely)).

- New to SKOS itself? → [SKOS reference](skos-reference.md)
- Building from a spreadsheet? → [Building a taxonomy in a spreadsheet](spreadsheet-import.md)
- Projects, passcode, autosave? → [Your workspace](workspace.md)
