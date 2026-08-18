# Why it works this way

A tour of the design decisions behind Intentional Arrangement SKOS — and the reasoning you can borrow if you build your own.

## Why it runs entirely in your browser

The app is one HTML file. Open it and you're building; close the tab and your work sits in that browser's storage. There's no server in the middle, no account to create, nothing uploaded.

Three things come out of that:

- **Your vocabulary stays yours.** A taxonomy can encode a company's product line, a lab's methods, a client's internal categories. That data never leaves the machine, so there's nothing to leak and no terms-of-service to read.
- **It opens anywhere and keeps working.** Email the file, drop it on a USB stick, run it on a plane. It'll still open in a browser years from now, because it depends on nothing but the browser.
- **You can read it.** View source and the editor, the validator, the exporters are right there. Nothing hides behind a build step.

The cost is honest: a browser tab can't do the jobs a server does, like accounts, live collaboration, or storing a million-concept vocabulary. When you need those, the optional Fuseki connection picks them up (see [hosting Fuseki](hosting-fuseki.md)). The app stays the client; the server is a choice, not a requirement.

## Why standards, all the way down

SKOS, ANSI/NISO Z39.19, ISO 25964, Dublin Core. The app treats these as the point, not the packaging.

A taxonomy built to the standards can be opened in Protégé, loaded into a triplestore, queried with SPARQL, and handed to a colleague who's never seen this tool. Build to a proprietary shape and you've made a thing one program understands. So the export is standard RDF, the validation checks the conditions the SKOS spec names, and the metadata is Dublin Core a librarian will recognize.

## Why SKOS-XL is its own mode

Plain SKOS attaches a label to a concept as a string: `skos:prefLabel "Dog"@en`. Fine, until someone asks "who approved that wording, and when?"

SKOS-XL answers by making each label a resource with its own identity (a `skosxl:Label`) that can carry provenance (`dcterms:source`), a change note, and a stable URI you can point at. The editor makes this a toggle rather than a rewrite: flip to SKOS-XL and every preferred, alternate, and hidden label gets an identifier assigned in the tool — a UUID when your scheme uses UUID ids, otherwise a readable one. That identifier sticks through reordering and edits, because a label's identity shouldn't change just because you dragged it up a slot.

You won't want this for a quick tag list. You will want it for a regulated glossary, a multilingual thesaurus that tracks translation provenance, or anything under governance.

## Why Collections sit beside the hierarchy, not inside it

`broader`/`narrower` says something strong: *Puppy is a kind of Dog.* A claim about meaning.

A collection says something softer: here's a set of concepts I want to look at together — "Animals featured in Q3," "terms up for review," "the Linnaean grouping." Fold one into the other and you corrupt both. So collections are their own structure (`skos:Collection`), and they nest into a second tree whose leaves are concepts. You can look at your vocabulary through the meaning-hierarchy and through an alternative grouping without either one lying about the other.

Ordered collections keep member order (`skos:memberList`), for the cases where sequence carries information: a reading order, a workflow, a ranked set.

## Why a share link carries the whole taxonomy

Click "Copy share link" and the app compresses your taxonomy and packs it into the URL after the `#`. Send that link and the recipient opens a read-only view — no server, no account, nothing stored on their end.

It's the fastest way to show someone your work. The limit is real, and the tool names it: a very large taxonomy makes a very long URL, and some browsers balk past a point. That's the seam where the Fuseki backend takes over. Publish to a server and the link becomes a short `?g=` pointer instead. Little vocabularies ride in the link; big ones live on the server.

## Why the license is size-based

The editor is free — to use, modify, and redistribute — for anyone at an organization under 75 people, under the Apache License 2.0. Cross 75 employees and you need an enterprise license.

The reasoning: an independent taxonomist, a grad student, a small shop should pay nothing and own their output. A large enterprise getting production value from the tool should help fund its upkeep. It's source-available, so you can audit every line, but it isn't OSI open-source, and that difference is said outright rather than blurred.

Whatever you build with it is yours. The license covers the software, not your vocabulary.

## Why quality checks run while you type

qSKOS is a catalog of known failure modes for concept schemes: a preferred label used twice, a concept with no documentation, a `related` link that contradicts a `broader` one, a cycle in the hierarchy. The editor runs these as you work and offers a one-click fix for most, so a problem gets caught at the keystroke that caused it instead of at export, a week later, in someone else's pipeline.

## Why there's a Glossary and a Proposals queue

Real vocabularies rarely start as a clean tree. They start as a heap of terms someone pasted from a spreadsheet. The **Glossary** is a staging bucket for that heap — drop raw terms in, then promote them into the taxonomy as top concepts or under a parent you pick, once the shape is visible.

**Proposals** cover the other direction. A subject-matter expert who isn't a taxonomist suggests a term from the Business view, and a taxonomist reviews and approves it. The people who know the domain feed the vocabulary; the person who knows SKOS keeps it consistent.

---

That's the thinking. If you're building your own tool, keep the standards — they're the durable part. The interface is one set of answers among many.
