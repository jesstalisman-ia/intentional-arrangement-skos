# A working reference for SKOS

This is the reference I wish I'd had when I started. It is short on purpose. It covers the parts of SKOS you actually use to build a sound thesaurus, in the order you meet them, and it points at the standards when you need the full text.

SKOS — the Simple Knowledge Organization System — is a W3C standard for writing down a controlled vocabulary as data. A thesaurus, a taxonomy, a subject-heading list: SKOS gives each of these a common shape that other software can read without knowing anything about your domain. It sits on top of RDF, so every concept is a thing with a stable identifier, not a row of text.

## The pieces

**Concept.** The unit. Each concept gets its own IRI — a stable identifier — so it stays the same thing even if you rename it. Type it `skos:Concept`.

**Concept scheme.** The container for a set of concepts that belong together, typed `skos:ConceptScheme`. Concepts point to it with `skos:inScheme`. The entry points at the top of the hierarchy are marked `skos:hasTopConcept` / `skos:topConceptOf`.

**Labels.** Every concept should have exactly one preferred label per language, set with `skos:prefLabel`. Synonyms go in `skos:altLabel`. Terms you want findable but not shown — misspellings, deprecated forms — go in `skos:hiddenLabel`. The three label types must not collide: a string cannot be both a preferred and an alternate label on the same concept.

**Labels with identity (SKOS-XL).** Plain SKOS labels are literals — you can't say anything *about* a label itself. [SKOS-XL](https://www.w3.org/TR/skos-reference/skos-xl.html) fixes that by reifying each label as a `skosxl:Label` resource with its own URI and a `skosxl:literalForm`; `skosxl:prefLabel` / `skosxl:altLabel` / `skosxl:hiddenLabel` link a concept to those resources. Because a label is now a thing with a URI, you can attach metadata to it — provenance (`dcterms:source`), dates, or relationships between labels. The editor supports this as a per-taxonomy **Label style**; it exports SKOS-XL alongside plain labels so nothing breaks for consumers that only read plain SKOS. Reach for it when the origin of individual terms matters; otherwise plain labels are simpler.

**Hierarchy.** `skos:broader` points from a narrower concept to a wider one; `skos:narrower` is its inverse. Keep them consistent, and never let the chain loop back on itself — a concept cannot be its own ancestor.

**Association.** `skos:related` links two concepts that belong together without one being broader than the other. A pair cannot be both `broader` and `related`; pick the relationship that is true.

**Notes.** `skos:definition` for the meaning, `skos:scopeNote` for how to apply it, `skos:example`, `skos:editorialNote`, `skos:historyNote`. Definitions are where a vocabulary earns trust.

**Mapping.** When you connect your concepts to someone else's vocabulary, use the mapping properties: `skos:exactMatch`, `skos:closeMatch`, `skos:broadMatch`, `skos:narrowMatch`, `skos:relatedMatch`. `exactMatch` is a strong claim — the two concepts are interchangeable — so use it sparingly.

**Collections.** `skos:Collection` groups concepts for presentation (for example, "kinds of X") without adding a hierarchy level. Members go in `skos:member`.

## The conditions that keep it sound

A vocabulary can be well-formed RDF and still be broken as a thesaurus. These are the checks worth running on every version:

- One preferred label per concept per language.
- Preferred, alternate, and hidden labels never share a string on the same concept.
- No cycle in the `broader` / `narrower` chain — nothing is its own ancestor.
- Every concept has a path to a top concept; no orphans floating outside the hierarchy.
- `related` and `broader` are not asserted between the same pair.
- Mapping relations across schemes stay consistent (an `exactMatch` and a `broadMatch` between the same two concepts contradict each other).

The qSKOS quality checks formalize these and more. The editor in this project runs them while you work; the REST API and MCP server run the same class of checks over a file you hand them.

## How SKOS relates to the older standards

SKOS did not invent thesaurus practice — it encodes it. If you have worked with **ANSI/NISO Z39.19** (guidelines for monolingual controlled vocabularies) or **ISO 25964** (thesauri and interoperability with other vocabularies), the moves are familiar: preferred and non-preferred terms, broader/narrower/related, scope notes. SKOS is the data format that lets those decisions travel between systems. Reach for the ISO 25964 data model when you need the richer thesaurus constructs it defines; reach for SKOS when you need something other software will read today.

## Sources

- SKOS Reference (W3C): https://www.w3.org/TR/skos-reference/
- SKOS Primer (W3C): https://www.w3.org/TR/skos-primer/
- qSKOS quality criteria: https://github.com/cmader/qSKOS
- ANSI/NISO Z39.19: https://www.niso.org/publications/ansiniso-z3919-2005-r2010
- ISO 25964 (thesauri): https://www.iso.org/standard/53657.html
