---
name: skos
description: Build, validate, and convert SKOS thesauri and taxonomies. Use when creating or editing a controlled vocabulary (concepts, preferred/alternate labels, broader/narrower/related, mappings, concept-scheme metadata), when checking a vocabulary for integrity problems (cycles, orphans, duplicate labels, related/broader clashes), or when converting SKOS between Turtle, RDF/XML, JSON-LD, RDF/JSON, CSV, and Markdown.
---

# Building sound SKOS

This skill covers how to model a controlled vocabulary in SKOS well enough to hand it to another system. The full construct-by-construct reference is in [docs/skos-reference.md](../../../docs/skos-reference.md); read it first if any term below is unfamiliar. Working principle for this project: augmentation before automation. Propose changes and surface problems for a person to decide; do not silently rewrite someone's vocabulary.

## When to use this skill

- Creating a new taxonomy, thesaurus, or subject-heading list.
- Editing concepts: labels, hierarchy, associations, notes, mappings.
- Validating a vocabulary before shipping a version.
- Converting a vocabulary between RDF serializations or to CSV/Markdown.

## Modeling checklist

Work in this order. Each step depends on the ones before it.

1. **Scheme first.** Create one `skos:ConceptScheme` with an IRI and Dublin Core metadata (title, description, creator, publisher, date, rights, language). The scheme is the thing people cite.
2. **Concepts with stable IRIs.** Every `skos:Concept` gets its own IRI under the scheme's namespace. Do not reuse or recycle IRIs; a renamed concept keeps its IRI.
3. **One preferred label per language.** Set `skos:prefLabel`. Add synonyms as `skos:altLabel`, findable-but-hidden forms as `skos:hiddenLabel`. Never let one string serve two label types on the same concept.
4. **Hierarchy with `broader`.** Point narrower concepts at wider ones. Assert `skos:topConceptOf` (and `skos:hasTopConcept` on the scheme) for entry points. Keep `broader`/`narrower` inverse-consistent.
5. **Associations with `related`.** Use only for concepts that belong together without a hierarchy between them. Never assert `related` and `broader` on the same pair.
6. **Definitions and scope notes.** `skos:definition` for meaning, `skos:scopeNote` for how to apply. This is what makes the vocabulary trustworthy.
7. **Mappings last.** Link to external vocabularies with the match properties. Reserve `skos:exactMatch` for concepts that are genuinely interchangeable.

## Integrity conditions to enforce

Run these on every version. A vocabulary can be valid RDF and still fail as a thesaurus.

- Exactly one `prefLabel` per concept per language tag.
- `prefLabel`, `altLabel`, `hiddenLabel` share no string on the same concept.
- No cycle in `broader`/`narrower` (no concept is its own ancestor).
- No orphan concepts: every concept reaches a top concept.
- No pair asserted as both `related` and `broader`.
- Mapping relations across schemes do not contradict (e.g. `exactMatch` plus `broadMatch` on the same pair).

## Tools in this repo

- **Editor + validator (browser app):** `app/index.html`, also hosted at https://jesstalisman-ia.github.io/intentional-arrangement-skos/ . Runs qSKOS-class checks while editing. Fully static, localStorage only, no network calls.
- **REST API:** `api/server.py` — `POST /validate` (SHACL integrity shapes + structural checks: cycles, orphans, label clashes + a profile summary) and `POST /convert?to=<fmt>`. Engine in `api/skoslib.py`, shapes in `api/skos-shapes.ttl`.
- **MCP server:** `mcp-server/skos_mcp.py` — tools `validate_skos`, `convert_skos`, `skos_profile`, over the same engine.

## Serialization notes

Turtle is the readable default. The app and API also emit RDF/XML, JSON-LD, RDF/JSON, CSV, and Markdown. All RDF forms round-trip without loss; CSV and Markdown are flattened views for people, not lossless carriers — do not treat a CSV export as the source of truth.

See [docs/skos-reference.md](../../../docs/skos-reference.md) for the construct reference and links to the W3C SKOS spec, qSKOS, ANSI/NISO Z39.19, and ISO 25964.
