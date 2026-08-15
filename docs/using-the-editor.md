# Using the editor

A walk through the editor, tab by tab, from a blank project to a taxonomy you can hand off. If you haven't opened the tool yet, start with the [install guide](install.md); for the login, projects, and autosave, see [your workspace](workspace.md).

The app has five tabs: **Build**, **Business view**, **Graph**, **Export**, and **Validate**. You author in Build, check your work in Validate, read it in Business view, see its shape in Graph, and take it out in Export.

## Start a project

From the welcome screen, open a taxonomy you're working on or start a new one. A new project asks for its [Dublin Core metadata](workspace.md#starting-a-project-with-dublin-core-metadata) — a title is the only required field. Every change saves to your browser on its own; there's no save button to remember.

## Build — author your concepts

The Build tab is where the work happens. The tree of concepts sits on the left; the editor for the selected concept sits on the right.

### Grow the hierarchy

- **Add a top concept** with the button above the tree. A top concept sits at the root — it has no parent.
- **Add a child** to build depth. A child points up to its parent through `broader`.
- Select any concept in the tree to edit it. Drag or use the concept's own fields to change where it sits.

### A concept's fields

**Identifier vs. preferred label.** These are two different things, and keeping them straight saves pain later:

- The **identifier** (the URI fragment) is the concept's identity. It stays fixed even when you rename the label.
- The **preferred label** is what people read. Changing it does *not* change the identifier.

Because they can drift apart, the editor gives you help: **↦ from label** sets the identifier from the current preferred label, **⟳ UUID** assigns an opaque, stable identifier, and a warning appears if two concepts end up with near-identical identifiers (for example `MonthJournal` and `Monthjournal`, which are two different concepts).

**Labels.**

- **Preferred label** — one per language. This is the concept's headline term.
- **Alternative labels** — synonyms and accepted variants.
- **Hidden labels** — terms you want found in search but not shown, such as common misspellings or retired names.

Each label carries a language tag (`en`, `fr`, …). A whitespace-only label is trimmed when you leave the field, so an empty label doesn't quietly linger.

**Notes.**

- **Definition** — what the concept means. This is where a vocabulary earns trust.
- **Scope notes** — how and when to use it, including any judgment calls (see the note on `broader` below).

**Structure.**

- **Broader** — the concept's parent(s). The tool supports poly-hierarchy, so a concept can sit under more than one parent.
- **Related** — an associative link to a concept that belongs alongside this one without being a parent or child.
- **Top concept** — mark the entry points at the top of the scheme.
- **Notation** — a code or classification number, if you use one.

> **A note on `broader`.** SKOS `broader` covers both "is a kind of" and, in practice, "is a part of." If you use it for containment — say, *Day* is part of *Week* rather than a kind of week — record that in a scope note so the distinction survives into anything you build downstream.

**Mappings.** Link a concept to the same or a related concept in another vocabulary with the mapping properties: `exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`. Reserve `exactMatch` for concepts that are genuinely interchangeable.

**Linked artifacts.** Attach documents, images, or links that give a concept context for the people using it.

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

Export from the Export tab. The RDF forms are lossless; the flat forms are for people and other tools.

- **Turtle** — the readable default, lossless.
- **RDF/XML, JSON-LD, RDF/JSON** — the same content in other RDF serializations.
- **CSV, Excel (`.xlsx`)** — a flat, spreadsheet-friendly view. Good for editing and review; treat an RDF export as the version of record.
- **Markdown** — the vocabulary and its links as one readable document.

Everything is generated in your browser. Nothing is uploaded.

## Import — bring work in safely

Import (the **Import** button in the header) reads a SKOS taxonomy from RDF or a spreadsheet. It asks **where it should go**:

- **Create a new project** (default) — your other projects stay untouched.
- **Merge into the current project** — adds concepts to what you have, and never overwrites.

After an import, a short summary reports the concept count and top concepts, and warns if the result looks flat or disconnected — a sign a spreadsheet's `broader` column didn't match. For the spreadsheet format and a fill-in template, see [building a taxonomy in a spreadsheet](spreadsheet-import.md).

## Scheme metadata

Under **Concept scheme, identifiers & Dublin Core metadata** you set the vocabulary's own record: title, description, creator, publisher, the created/published/modified dates, rights, and language, plus the base namespace and whether identifiers are readable or UUIDs. This metadata travels with every export.

## Where your work lives

Projects, autosave, the optional passcode, and moving work between machines are covered in [your workspace](workspace.md). The short version: it's all in your browser, it saves itself, and you move it by exporting and importing.
