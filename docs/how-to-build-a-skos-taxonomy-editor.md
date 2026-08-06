# Part 1 — How I Built a SKOS Taxonomy Editor (With an AI Partner, Not on Autopilot)

*This is the first in a series on building an open-standards studio for taxonomies and ontologies. It's a **how-to**: by the end you should be able to stand up your own SKOS taxonomy editor with an AI partner and get a legitimate, downloadable vocabulary out of it. Two principles run underneath everything: this is **informed building, not blind building**, and **augmentation, not automation** — the standards and my discipline are the authority, the AI implements and verifies under it, and a human stays in the loop at every consequential step.*

---

## Step 0 — The mindset: bring the evidence first

The single decision that determined whether this worked was made before any code: I refused to let the model invent a taxonomy tool from nothing. I brought it my evidence and the field's standards first, and only then asked for an implementation. Everything below is downstream of that. So the how-to starts not with "prompt the AI" but with "assemble what the AI is allowed to reason from."

## Step 1 — Assemble the "SKOS skill": the knowledge you hand the AI

Think of a **skill** as a curated bundle of authority that the AI reads *before* it builds — so it's translating known rules into code rather than guessing. Mine had three layers, and they stack rather than repeat:

**1. The standards, distilled with clause pointers.**
- **SKOS — the W3C SKOS Reference.** The data model: `skos:Concept`, `prefLabel`/`altLabel`/`hiddenLabel`, `broader`/`narrower`/`related`, the mapping properties, `ConceptScheme`, and the integrity conditions that make a graph consistent — S13 (the three label types never share a literal), S14 (one `prefLabel` per language), S27 (`related` is disjoint with `broaderTransitive`), S9/S37 (Concept, Scheme, Collection are pairwise disjoint).
- **ANSI/NISO Z39.19-2005** — the American national standard for controlled vocabularies: term form (singular/plural by count/mass, direct entry, homograph qualifiers), the USE/UF preferred-term relationship, BT/NT/RT hierarchy and association, scope notes.
- **ISO 25964-1/-2** — the international thesaurus standard and its interoperability guidance (what SKOS lacks: arrays, compound equivalence, mapping between vocabularies).

**2. My own hand-built `.ttl` files** — worked examples of how *I* apply those rules (more on this in Step 2).

**3. A validation harness** — the SKOS core vocabulary and a set of SHACL shapes, so "does this conform?" is a command, not an opinion.

**How it's referenced:** I packaged these as a reusable skill — a folder of `references/` (each standard restated in its own words with pointers back to the clause), `scripts/validate_skos.py` (SHACL + structural + editorial checks), and `assets/shapes/` (integrity shapes you copy and tune per project). The point of packaging it is that the discipline becomes *reusable* — I don't re-explain SKOS every session; I point the AI at the skill and it builds under those rules every time.

The prompt pattern that operationalizes this:

> "Here are my SKOS reference notes (SKOS W3C, Z39.19, ISO 25964) and a sampling of `.ttl` vocabularies I authored by hand. Build the editor's data model and serializers to conform to the SKOS integrity conditions (S13, S14, S27) and Z39.19 term rules, and follow the conventions in my files. When in doubt, cite the rule you're applying."

That last sentence matters: it forces the model to work *from* the authority, and it makes its choices auditable.

## Step 2 — Model from the `.ttl` files I'd built by hand (the first pass had no AI in it)

I already had Turtle files I'd authored myself, without AI — a procedural-knowledge ontology, a company taxonomy, industry and audit modules. The first real modeling pass was to **read those files as evidence, not load them as data.** I went looking for the recurring shapes:

- Where does a plain label become an addressable **concept** (a URI)?
- What are my **`prefLabel` conventions** — casing, singular/plural, how I disambiguate homographs?
- Where do concepts acquire parents (`broader`), and where is it genuinely poly-hierarchical?
- Where do I reach *across* vocabularies with `exactMatch`/`closeMatch`?
- Where does it cross from a controlled list into classes, domains, ranges (the ontology line — a later part of this series)?

Then I shaped the tool's in-memory model to **mirror those patterns**, because when the model matches the source patterns, serialization becomes mechanical and the tool ends up feeling like *mine*:

```js
// A concept, shaped like the patterns my files revealed.
function emptyConcept(id) {
  return {
    id,                 // local name -> part of the URI
    pref: [],           // [{lang:"en", val:"Onboarding"}]  one preferred label per language
    alt:  [],           // synonyms / variants  (the UF set)
    hidden: [],         // misspellings, for search only
    definition: [], scopeNote: [], notation: "",
    broader: [],        // LIST -> honest poly-hierarchy
    related: [],
    exactMatch: [], closeMatch: [], broadMatch: [], narrowMatch: [], relatedMatch: [], // linked data
    top: false
  };
}
```

A single Turtle pattern from my files maps onto that object almost one-to-one:

```turtle
ex:onboarding a skos:Concept ;
  skos:prefLabel "Onboarding"@en ;
  skos:altLabel  "New-hire ramp"@en ;
  skos:broader   ex:human-resources ;
  skos:definition "The process of integrating a new employee."@en .
```

Keeping `broader` as a **list** (not a single value) preserves real poly-hierarchy; keeping a separate stable `order` array makes exports deterministic so diffs stay sane. Those two small choices came straight from reading how my own files behaved.

## Step 3 — No `.ttl` files or build patterns? Here's your cold-start

Most people won't have a stack of hand-authored vocabularies. You can still build *informed*, not blind — you just borrow the discipline and the exemplars instead of supplying your own:

1. **Let the standards be your pattern source.** Z39.19 gives you term form and the USE/UF and BT/NT/RT rules; the SKOS Reference gives you the encoding. That alone replaces most of what my files taught the model.
2. **Study one or two published SKOS vocabularies as your "sample files."** Download a slice of the **Getty AAT**, **Library of Congress Subject Headings** (id.loc.gov), **EuroVoc**, **AGROVOC**, or the **UNESCO Thesaurus** as Turtle and read how professionals handle `prefLabel`, `broader`, `scopeNote`, and `notation`. Hand that slice to the AI the way I handed mine.
3. **Establish warrant before terms.** Every concept needs a reason to exist — literary (it's in your documents), user (it's in your search logs), or organizational (a process depends on it). Don't let the AI round out a hierarchy with invented siblings; unwarranted concepts are the hardest padding to remove later.
4. **Hand-model a tiny seed first — 10 to 20 concepts.** Settle term form, fold synonyms into `altLabel`, build a shallow hierarchy where every `broader` link passes the "all-and-some" test, write a few scope notes. Now *you* have a pattern file, authored by a human, and you're no longer cold-starting.
5. **Then bring the AI in to generalize and build the tool.**

The principle holds even with zero prior files: informed building means *someone's* discipline is the authority. If it isn't yours yet, borrow the field's — never the model's guesses.

## Step 4 — The editor: capturing and rendering the things that matter (and the options)

With the model settled, the editor's job is to make sure the constructs the standards care about can actually be **captured** and **rendered** — and to expose the choices as real options rather than silent defaults. Here's what I made sure the editor captures, and how:

- **Concept as a *thing*, with an identity option.** Every concept gets a URI. The option that matters: a **readable slug** IRI (`…#onboarding`) versus an **opaque UUID** identity, for when a label will change but the thing must not. Mint IRIs opaque and permanent; never encode the hierarchy in the IRI path — the hierarchy is data and it *will* change.
- **Labels, typed and language-tagged.** One `prefLabel` per language (the editor enforces S14 — a second preferred label in a language isn't a richer concept, it's two concepts that were never separated), any number of `altLabel`, and `hiddenLabel` for misspellings. Language-tag *everything*, even in a monolingual vocabulary, because monolingual vocabularies acquire a second language more often than anyone plans for.
- **Hierarchy with real poly-hierarchy.** Capture `broader` as a list; **render `narrower` as the inverse** rather than storing both (store both and they drift). Enforce acyclicity *at edit time* — a cycle caught when it's created is a rejected edit; the same cycle caught at export is a research project.
- **Association, sparingly.** `related` is symmetric; assert it once. Overuse turns a thesaurus into an undifferentiated mesh.
- **Documentation.** `definition` (what it means) and `scopeNote` (how to apply it, where its boundary falls). Contested terms need the scope note more than the definition.
- **Notation** — a typed code, unique within the scheme; not a word in a language.
- **Linked data.** The mapping properties (`exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`) to concepts in *other* schemes. Treat `exactMatch` with suspicion — it's transitive, so a careless one propagates equivalence everywhere it touches.

The **options** the editor surfaces — readable vs. UUID IRIs, plain SKOS vs. SKOS-XL labels, default language, whether to emit Dublin Core metadata — are exactly the decisions Z39.19 and the SKOS spec say you must make consciously. Rendering is the mirror of capture: a tree built from `broader`, and a per-concept form with a field for each construct, so a human can *review* what was captured. That review surface is where "augmentation, not automation" lives — the AI can propose a concept, but it lands in this form for a person to accept.

## Step 5 — The Business view: a read surface for the people who aren't taxonomists

The Build tab is for the person who knows SKOS. Everyone else — the domain experts whose knowledge you're actually encoding — needs a way in that doesn't require them to understand `skos:broader`. So I built a **Business view**: the same model, rendered read-only and human-friendly — browse concepts by their labels and definitions, follow the hierarchy, see linked resources — plus a lightweight **term-proposal workflow**.

The proposal workflow is the human-in-the-loop mechanism at the edges of the system: a subject-matter expert can *suggest* a term or flag a gap without touching the model; the suggestion lands in a queue for the taxonomist to accept, refine, or decline. That's augmentation in organizational form — the tool widens who can contribute knowledge while keeping a single accountable editor. How to build it: reuse the model, swap the presentation layer for a read-only render, and capture proposals as a separate reviewable list rather than direct edits.

## Step 6 — qSKOS: the validator that rides shotgun

Here is the belief that shaped the whole tool: **an editor without a validator is a liability.** It's trivially easy to author a vocabulary that looks fine and is quietly broken, and none of these throw an error:

- a concept that is its own ancestor (a cycle);
- an orphan with no path to a top concept;
- two `prefLabel`s fighting over one language (S14), or a literal shared between `prefLabel` and `altLabel` (S13);
- `related` asserted between a concept and its own ancestor (S27) — usually a hierarchical link that was meant to be associative;
- a mapping that points nowhere; a "concept" with no label; a concept in no scheme.

So the editor carries a quality suite in the spirit of **qSKOS**, and it runs *in the edit loop*, not as an export-time afterthought. Build it to **triage**, not just flag — separate "violates the standard" from "contrary to convention" from "editorially incomplete," because those get fixed by different people on different timelines. Offer one-click fixes for the mechanical ones. For an authoritative pass, back the in-browser checks with SHACL shapes run by a real processor (I use a `validate_skos.py` that combines SHACL, structural, and editorial checks and prints a profile block — depth, fan-out, documentation coverage — so you can see *what kind* of vocabulary you have before reading the findings). A max depth of 2 across 4,000 concepts is a flat list wearing a hierarchy's clothes; 4% documented means it can't be applied consistently no matter how clean the structure is.

Validation and authoring are inseparable because the entire value of a taxonomy is its *trustworthiness*. A vocabulary you can't trust is worse than none, because now a machine is confidently building on a bad foundation.

## Step 7 — Export and import: no lock-in, and round-trips you can prove

**Export** is the promise that nothing you author is trapped. Build it as **one canonical triple-builder feeding several serializers** — that way every format is the *same graph*, just dressed differently:

- **Turtle** — the human-readable face of RDF, the one you diff.
- **RDF/XML** — the lingua franca older enterprise tooling still expects.
- **JSON-LD** — RDF a web developer can `JSON.parse`.
- **CSV** — the escape hatch to the spreadsheet world.
- **Markdown** — the vocabulary and its linked-data mappings as one readable document, for human review *and* as grounding context you can feed an LLM.

Keep output **deterministic** (stable concept order) so diffs and tests stay meaningful. A one-line download turns any of these into a file:

```js
function download(name, text, mime){
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  Object.assign(document.createElement("a"), {href:url, download:name}).click();
  URL.revokeObjectURL(url);
}
```

**Import** is the mirror, and it matters just as much: nobody starts from zero. Parse Turtle/RDF into triples, then into the model, preserving **language tags and typed notations** exactly. Expect real-world messiness — SPARQL-style `PREFIX` directives, blank nodes, annotations hanging off classes that aren't concepts — and handle it; every quirk you absorb makes the tool *more* faithful to the standard, not less. Import is also what closes the loop with the rest of the pipeline: a cleaned spreadsheet, a reconciled dataset, or a graph pulled from a triplestore can become a *starting* taxonomy instead of a dead end.

Then **prove it round-trips**, because "it looks like Turtle" is not the same as "it *is* the graph." Use an independent oracle — `rdflib` — to parse your export, re-serialize it to another format, and assert the two graphs are **isomorphic**; then run the SKOS integrity checks on the result:

```python
from rdflib import Graph
g  = Graph().parse("taxonomy.ttl",   format="turtle")
g2 = Graph().parse("taxonomy.jsonld", format="json-ld")
assert g.isomorphic(g2)      # same graph in both serializations
print(len(g), "triples verified")
```

When rdflib parses your file, round-trips it, and the integrity checks pass, you haven't built a lookalike. You've built the real thing — ordinary RDF that Protégé, Skosmos, a SPARQL engine, or the next tool down the line will read unchanged.

## Why this order, and why it's the foundation for reliable AI

Notice the shape of the how-to: authority first (the skill), then your own patterns (or borrowed ones), then a capture surface with conscious options, then a read view for humans, then validation, then lossless exchange. It's the same discipline twice over. I didn't let the model improvise the *tool* — I grounded it in my files and the standards. In exactly the same way, you don't let a model improvise *answers* — you ground it in a curated, validated vocabulary. Informed building produces the tool; informed grounding produces the trustworthy answer. Bring the evidence first, and keep a human in the loop — applied to how you build, and to what you build for.

That's why the taxonomy editor is where reliable AI actually begins. Not a bigger model — knowledge with stable identity, explicit meaning, checkable correctness, and no lock-in. Which is exactly, and only, what SKOS on RDF gives you.

*— Next in the series: reaching into the open graph to harvest concepts from linked data, and the neurosymbolic "propose / dispose" loop in practice.*
