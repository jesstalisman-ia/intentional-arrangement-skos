# Markdown export

The editor exports your concept scheme as a single Markdown document — one of the
formats on the **Export** tab, alongside Turtle, RDF/XML, JSON‑LD, RDF/JSON, CSV, and
Excel. It is real, structured Markdown (not plain text with a `.md` suffix), built for two
audiences:

- **People** — a readable, browsable document with a table of contents and cross-links,
  ready to drop into GitHub, Obsidian, a wiki, or a pull request.
- **Language models** — a clean, flat rendering of your labels, hierarchy, and linked-data
  mappings that an LLM can ingest as grounding context.

It is downloaded with MIME type `text/markdown` and a `.md` extension.

## How to export

1. Open the **Export** tab.
2. Choose **Markdown**.
3. Download — the file is named from your scheme.

You can also call it headlessly through the bundled engine: `Core.toMarkdown(model)`
returns the document as a string.

## What the document contains

Every export has the same three parts, in order:

1. **Scheme header** — the title as an `#` heading, the description as a blockquote, then a
   metadata block (scheme URI, concept count, creator, publisher, created date, rights,
   language). Only the fields you filled in appear.
2. **Contents** — the full hierarchy as a nested bulleted outline, each entry a link that
   jumps to that concept below. Top concepts (or any concept with no in-scheme broader) are
   the roots; narrower concepts nest beneath them, sorted alphabetically.
3. **Concepts** — one `###` section per concept, with its definition, scope note, URI, and
   every relation and mapping it carries.

A generated-by line closes the document.

## The Markdown syntax it uses

| Construct | Syntax | Where it appears |
|---|---|---|
| Headings | `#`, `##`, `###` | Scheme title; the **Contents** and **Concepts** sections; each concept |
| Blockquote | `> …` | Scheme description; per-concept scope notes |
| Bold | `**…**` | Every field label (`**URI:**`, `**Broader:**`, `**Narrower:**`, `**Related:**`, `**Linked data:**`, …) |
| Italic | `_…_` | Non-default language tags; match types (`_exact match_`); resource types |
| Inline code | `` `…` `` | The scheme URI, each concept URI, and `notation` codes |
| Nested lists | `- ` with two-space indent | The Contents outline (one indent per hierarchy level) and each concept's fact rows |
| Internal link | `[Label](#anchor)` | Cross-references between concepts (broader / narrower / related, and Contents entries) |
| External link | `[text](https://…)` | Linked-data mappings and attached resources |
| Horizontal rule | `---` | Between the Contents outline and the Concepts body |
| Hard line break | two trailing spaces | Inside the metadata block, so each field is its own line |

### Internal links and anchors

Broader, narrower, related, and Contents entries render as `[Label](#anchor)`. Anchors are
GitHub-style slugs of the preferred label (lowercased, punctuation stripped, spaces to
hyphens), de-duplicated so that two concepts sharing a label still resolve to distinct
targets. Any concept referenced but missing from the scheme is shown as inline code rather
than a broken link.

### External IRI shortening

Mapping targets keep their full URL as the link, but the visible text is shortened to a
friendly CURIE when the IRI is from a well-known source:

| Source | Prefix |
|---|---|
| Wikidata (`wikidata.org/entity/`, `/wiki/`) | `wd:` |
| DBpedia (`dbpedia.org/resource/`, `/page/`) | `dbr:` |
| Getty AAT / TGN / ULAN | `aat:` · `tgn:` · `ulan:` |
| Library of Congress Subject Headings | `lcsh:` |
| SKOS core | `skos:` |

Anything else falls back to the last path segment of the IRI.

## Worked example

A four-concept scheme — with a broader/narrower pair, a related pair, a scope note, an
alternate label, a notation, a Wikidata `exactMatch`, a Getty `closeMatch`, and an attached
resource — exports to exactly this:

````markdown
# Workplace Skills

> A small example concept scheme for demonstrating the Markdown export.

**Scheme URI:** `http://example.org/skills`  
**Concepts:** 4  
**Creator:** Jessica Talisman  
**Publisher:** Ontology Pipeline  
**Created:** 2026-08-16  
**Rights:** CC BY 4.0  
**Language:** en

## Contents

- [Deployment](#deployment)
- [Incident response](#incident-response)
- [Onboarding](#onboarding)
  - [Access provisioning](#access-provisioning)

---

## Concepts

### Onboarding  `ONB`

Bringing a new employee into the organization and its systems.

> Use for people processes, not software installation.

- **URI:** `http://example.org/skills/onboarding`
- **Also known as:** New-hire setup
- **Narrower:** [Access provisioning](#access-provisioning)
- **Linked data:**
  - _exact match_ → [wd:Q1058754](http://www.wikidata.org/entity/Q1058754)
- **Resources:**
  - [Onboarding checklist](https://example.org/onboarding.pdf) _(PDF)_

### Access provisioning

Granting accounts and permissions.

- **URI:** `http://example.org/skills/access-provisioning`
- **Broader:** [Onboarding](#onboarding)
- **Related:** [Incident response](#incident-response)

### Incident response

- **URI:** `http://example.org/skills/incident-response`
- **Also known as:** On-call response
- **Related:** [Access provisioning](#access-provisioning)
- **Linked data:**
  - _close match_ → [aat:300404126](http://vocab.getty.edu/aat/300404126)

### Deployment

- **URI:** `http://example.org/skills/deployment`


*Generated from a SKOS concept scheme — labels, hierarchy, and linked-data mappings. Exported as Markdown for human review and as grounding context for language models.*
````

## A note on escaping

The document is Markdown-*structured* but literal text (labels, definitions, scope notes)
is written verbatim — it is not backslash-escaped. Taxonomy labels rarely contain Markdown
metacharacters, but if a label does include `*`, `_`, `` ` ``, or `[`, a strict renderer may
interpret it as formatting. If you rely on exact rendering of such labels, export Turtle or
JSON‑LD as the source of record and treat the Markdown as a human-facing view.

## Related

- **[Using the editor](using-the-editor.md)** — the full workflow, including every export format.
- **[Building a taxonomy in a spreadsheet](spreadsheet-import.md)** — the CSV/Excel round-trip.
- **[SKOS reference](skos-reference.md)** — the constructs behind each field shown above.
