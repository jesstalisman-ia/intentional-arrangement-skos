# One Component: Build a SKOS Editor That Produces Downloadable Turtle

*A how-to for building with Claude — from a list of labels to a legitimate, standards-clean taxonomy you can hand to Protégé, Skosmos, or rdflib.*

Most "build an app with AI" tutorials pick something with no ground truth — a to-do list, a landing page — where "done" is a matter of taste. This one is different on purpose. We're going to build a single component, a **SKOS editor and renderer**, and the reason it makes such a good teaching project is that *correctness is defined by a published standard.* When you finish, you won't have "a thing that looks like a taxonomy." You'll have a file that any RDF tool on earth will read back as the exact concepts you authored. That verifiability is the whole point — and it's what makes Claude a genuinely reliable partner here rather than a plausible-sounding guesser.

Everything below fits in one HTML file. No framework, no build step, no database. One component, done well.

## What SKOS actually is (the five ideas you need)

SKOS — Simple Knowledge Organization System — is a W3C standard for expressing taxonomies, thesauri, and controlled vocabularies as RDF. You do not need to "learn RDF" first. You need five ideas.

1. **A concept is a thing, not a word.** The move that makes SKOS legitimate is giving every concept a *URI* — a stable web identifier — and then hanging words on it. "Dogs" is a label; `https://example.org/scheme/dogs` is the concept. This is the difference between a spreadsheet and a knowledge graph.
2. **Labels are typed and language-tagged.** `skos:prefLabel` is the one preferred label per language. `skos:altLabel` holds synonyms. `skos:hiddenLabel` holds misspellings you want search to catch but never display. Every label carries a language tag: `"Dogs"@en`.
3. **Hierarchy is a relationship, not indentation.** `skos:broader` points from a concept to its parent; `skos:narrower` is its inverse. A concept can have more than one parent (real poly-hierarchy), which no indented spreadsheet can honestly represent.
4. **Association and mapping.** `skos:related` links peers within your scheme. The mapping properties — `skos:exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch` — link *your* concept to someone else's, e.g. a Wikidata or DBpedia URI. This is how your vocabulary joins the wider web.
5. **The scheme ties it together.** A `skos:ConceptScheme` is the container. Concepts declare `skos:inScheme`; the top of the tree is marked with `skos:topConceptOf` (and the scheme with `skos:hasTopConcept`).

That's it. Definitions (`skos:definition`), scope notes (`skos:scopeNote`), and notations (`skos:notation`, a code like a Dewey number) are useful extras, but the five ideas above are the spine.

The namespace, which you'll see everywhere, is `http://www.w3.org/2004/02/skos/core#`.

## The arrangement: a data model that mirrors the standard

Here is the single most important decision, and it's an *intentional arrangement* one: **your in-memory data model should be shaped like SKOS, not like your UI.** If your model mirrors the standard, serialization becomes a boring, mechanical translation — and boring is exactly what you want in the part that has to be correct.

A concept is a plain object:

```js
// One concept. Note: labels are keyed by language; broader is a list of parent ids.
function emptyConcept(id) {
  return {
    id,                    // local name -> becomes part of the URI
    pref: {},              // { en: "Dogs" }               one preferred label per language
    alt:  {},              // { en: ["Canines", "Doggos"] } synonyms
    hidden: {},            // { en: ["Dgos"] }             for search only
    definition: {},        // { en: "Domesticated canids." }
    notation: "",          // e.g. "636.7"
    broader: [],           // ["animals"]  parent concept ids (poly-hierarchy allowed)
    related: [],           // ["wolves"]
    exactMatch: [],        // ["http://www.wikidata.org/entity/Q144"]  external URIs
    top: false             // is this a top concept of the scheme?
  };
}

const model = {
  base: "https://example.org/scheme/",   // concept URIs = base + id
  scheme: { id: "scheme", title: "My Taxonomy", lang: "en" },
  concepts: {},                          // { animals: {...}, dogs: {...} }
  order: []                              // ids, to keep a stable display/serialize order
};
```

Two small choices in that model repay themselves constantly. Keeping `broader` as a **list** (not a single value) gives you honest poly-hierarchy for free. Keeping `order` as a separate array means your Turtle output is deterministic — the same model always produces byte-identical files, which makes diffs and tests sane.

**Prompt Claude like this:** *"Give me a plain-JS data model for a SKOS concept scheme. Concepts have language-keyed prefLabel/altLabel, a list of broader parents, related, and exactMatch to external URIs. No framework. Also give me `addConcept`, `setPrefLabel(id, lang, text)`, and `setBroader(childId, parentId)` with a guard that a concept can never become its own ancestor."* That last guard matters — SKOS hierarchy must be acyclic, and it's the kind of invariant you want enforced in the editor, not discovered later by a validator.

## The editor: three operations and one invariant

An editor is deceptively small. Ninety percent of the value is three operations — create a concept, edit its labels, set its parent — plus rendering the tree. Here's the cycle-guard, because it's the one piece of real logic:

```js
function isAncestor(ancestorId, id, seen = new Set()) {
  if (id === ancestorId) return true;
  if (seen.has(id)) return false;            // defend against existing cycles
  seen.add(id);
  return (model.concepts[id]?.broader || []).some(p => isAncestor(ancestorId, p, seen));
}

function setBroader(childId, parentId) {
  if (childId === parentId) return "A concept can't be its own parent.";
  if (isAncestor(childId, parentId)) return "That would create a loop in the hierarchy.";
  const c = model.concepts[childId];
  if (!c.broader.includes(parentId)) c.broader.push(parentId);
  c.top = false;                             // it now has a parent, so it isn't a top concept
}
```

Rendering the tree is a recursion over `broader`. The roots are the concepts that are either explicitly `top` or have no surviving parent:

```js
const rootsOf = () => model.order.filter(id => {
  const c = model.concepts[id];
  return c.top || !(c.broader || []).some(p => model.concepts[p]);
});

const childrenOf = parentId =>
  model.order.filter(id => (model.concepts[id].broader || []).includes(parentId));
```

Notice the small robustness move in `rootsOf`: a concept whose parent was deleted still shows up as a root instead of vanishing. When you're building with Claude, *name these edge cases in your prompt* — "what happens to a child when I delete its parent?" — because they're precisely the things that look fine in a demo and bite a real user on day two.

## The renderer that matters: serialization to Turtle

This is the component's reason to exist. A SKOS editor that can't emit standards-clean RDF is a toy. Turtle (`.ttl`) is the most human-readable RDF serialization, so we'll write that first.

The only genuinely fiddly part is escaping string literals, so isolate it:

```js
const esc = s => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
                   .replace(/\n/g, "\\n").replace(/\t/g, "\\t");
const lit = (text, lang) => `"${esc(text)}"${lang ? "@" + lang : ""}`;

function toTurtle(model) {
  const B = model.base, S = model.base + model.scheme.id;
  let out =
`@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix ex:   <${B}> .

<${S}> a skos:ConceptScheme ;
  dct:title ${lit(model.scheme.title, model.scheme.lang)} .

`;
  for (const id of model.order) {
    const c = model.concepts[id], uri = `ex:${id}`;
    const lines = [`a skos:Concept`, `skos:inScheme <${S}>`];

    for (const [lang, t] of Object.entries(c.pref)) lines.push(`skos:prefLabel ${lit(t, lang)}`);
    for (const [lang, arr] of Object.entries(c.alt))
      for (const t of arr) lines.push(`skos:altLabel ${lit(t, lang)}`);
    for (const [lang, t] of Object.entries(c.definition)) lines.push(`skos:definition ${lit(t, lang)}`);
    if (c.notation) lines.push(`skos:notation "${esc(c.notation)}"`);

    if (c.top) lines.push(`skos:topConceptOf <${S}>`);
    for (const p of c.broader)     lines.push(`skos:broader ex:${p}`);
    for (const r of c.related)     lines.push(`skos:related ex:${r}`);
    for (const m of c.exactMatch)  lines.push(`skos:exactMatch <${m}>`);

    out += `${uri}\n  ${lines.join(" ;\n  ")} .\n\n`;
  }
  return out;
}
```

Run it on a two-concept model and you get exactly what a librarian or an ontologist would expect to see:

```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix ex:   <https://example.org/scheme/> .

<https://example.org/scheme/scheme> a skos:ConceptScheme ;
  dct:title "My Taxonomy"@en .

ex:animals
  a skos:Concept ;
  skos:inScheme <https://example.org/scheme/scheme> ;
  skos:prefLabel "Animals"@en ;
  skos:topConceptOf <https://example.org/scheme/scheme> .

ex:dogs
  a skos:Concept ;
  skos:inScheme <https://example.org/scheme/scheme> ;
  skos:prefLabel "Dogs"@en ;
  skos:altLabel "Canines"@en ;
  skos:definition "Domesticated canids."@en ;
  skos:broader ex:animals .
```

## The same graph, as JSON-LD

JSON-LD is RDF that developers can `JSON.parse`. The trick is the `@context`: it maps short keys to full SKOS URIs, so the body stays readable while the semantics stay exact.

```js
function toJsonLd(model) {
  const S = model.base + model.scheme.id;
  const context = {
    skos: "http://www.w3.org/2004/02/skos/core#",
    dct:  "http://purl.org/dc/terms/",
    "@base": model.base,
    prefLabel:  { "@id": "skos:prefLabel", "@container": "@language" },
    altLabel:   { "@id": "skos:altLabel",  "@container": "@language" },
    definition:  { "@id": "skos:definition", "@container": "@language" },
    notation:    { "@id": "skos:notation" },
    broader:     { "@id": "skos:broader",    "@type": "@id" },
    related:     { "@id": "skos:related",    "@type": "@id" },
    exactMatch:  { "@id": "skos:exactMatch", "@type": "@id" },
    inScheme:    { "@id": "skos:inScheme",   "@type": "@id" },
    topConceptOf:{ "@id": "skos:topConceptOf","@type": "@id" }
  };

  const graph = [{
    "@id": S, "@type": "skos:ConceptScheme",
    "dct:title": { "@value": model.scheme.title, "@language": model.scheme.lang }  // language-tagged, to match the Turtle
  }];
  for (const id of model.order) {
    const c = model.concepts[id];
    const node = { "@id": id, "@type": "skos:Concept", inScheme: S };
    if (Object.keys(c.pref).length) node.prefLabel = c.pref;              // {en:"Dogs"} — @container:@language
    if (Object.values(c.alt).some(a => a.length)) node.altLabel = c.alt;
    if (Object.keys(c.definition).length) node.definition = c.definition;
    if (c.notation)          node.notation = c.notation;
    if (c.top)               node.topConceptOf = S;
    if (c.broader.length)    node.broader = c.broader;
    if (c.related.length)    node.related = c.related;
    if (c.exactMatch.length) node.exactMatch = c.exactMatch;
    graph.push(node);
  }
  return JSON.stringify({ "@context": context, "@graph": graph }, null, 2);
}
```

Because the `@container: "@language"` keys line up with our language-keyed model, `node.prefLabel = c.pref` is a *direct assignment*. That is the payoff of arranging the model to mirror the standard: the serializer barely has to think.

## Making it downloadable

"Downloadable" is one function. No server required — the browser writes the file:

```js
function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

download("taxonomy.ttl",    toTurtle(model),  "text/turtle");
download("taxonomy.jsonld", toJsonLd(model),  "application/ld+json");
```

## The part that makes it *legitimate*: verify against an oracle

Here's where building with Claude stops being vibes and becomes engineering. Anyone can produce text that *looks* like Turtle. The question is whether an independent, standards-compliant tool reads it back as the graph you intended. So you check — with [rdflib](https://rdflib.readthedocs.io/), which is nobody's opinion; it's a reference implementation.

```python
# pip install rdflib
from rdflib import Graph
from rdflib.namespace import SKOS, RDF

g = Graph().parse("taxonomy.ttl", format="turtle")
print(f"{len(g)} triples parsed cleanly")

# 1) round-trip: Turtle in, JSON-LD out — proves the graph is real RDF, not lookalike text
g.serialize("roundtrip.jsonld", format="json-ld")

# 2) SKOS sanity: every concept has exactly one prefLabel per language (integrity condition S14)
from collections import Counter
for c in g.subjects(RDF.type, SKOS.Concept):
    langs = Counter(l.language for l in g.objects(c, SKOS.prefLabel))
    dupes = [lang for lang, n in langs.items() if n > 1]
    assert not dupes, f"{c} has multiple prefLabels in {dupes}"

# 3) no concept is its own ancestor (hierarchy must be acyclic)
def ancestors(c, seen=None):
    seen = seen or set()
    for p in g.objects(c, SKOS.broader):
        if p not in seen:
            seen.add(p); ancestors(p, seen)
    return seen
for c in g.subjects(RDF.type, SKOS.Concept):
    assert c not in ancestors(c), f"cycle at {c}"

print("SKOS integrity checks passed")
```

If `rdflib` parses your file without complaint, round-trips it to JSON-LD, and passes those two integrity checks, you have not built a lookalike. You've built the real thing. Feed the same `.ttl` to [Skosmos](https://skosmos.org/) or open it in [Protégé](https://protege.stanford.edu/) and it will render your tree — because it *is* your tree.

**This is the loop to run with Claude:** ask it to write the serializer; save the output; parse it with rdflib; paste any error straight back to Claude. The errors are specific and standard-shaped — a bad IRI, a missing language tag, an unescaped quote — and each one makes the code more faithful to the spec. The standard is the spec you're both checking against, which is exactly why the partnership converges instead of drifting.

## Why one component, arranged intentionally, is enough

We built four small things — a standard-shaped model, three editor operations with one real invariant, two serializers, and a verifier — and together they're a legitimate SKOS editor. Nothing here is padding. The arrangement is the lesson: because the model mirrors the standard, the serializers are almost trivial; because the standard defines correctness, the AI partnership is verifiable; because the output is ordinary RDF, nothing you make is trapped in the tool.

Start with three concepts and one parent link. Export the Turtle. Parse it with rdflib. Watch it round-trip. Then add language tags, then `exactMatch` to a Wikidata URI, and watch your little tree quietly become part of the web of data. That's the whole craft: not more features, but the right things, arranged so that each one holds up the next.

---

*Build prompt to start with:* "Build me a single-file HTML SKOS editor. Data model: concepts with language-keyed prefLabel/altLabel/definition, a list of broader parents (poly-hierarchy), related, and exactMatch to external URIs, all inside one skos:ConceptScheme. Include add/edit/set-parent with an acyclic guard, a tree renderer, and export to both Turtle and JSON-LD with a download button. Then write an rdflib script that parses the Turtle, round-trips it to JSON-LD, and checks the SKOS integrity conditions." Then iterate against rdflib until it's green.
