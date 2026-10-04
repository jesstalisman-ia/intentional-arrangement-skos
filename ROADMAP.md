# Roadmap

What's shipped, what's in progress, and what's planned for the Intentional Arrangement SKOS editor. Priorities are shaped by hands-on user feedback — see **[how to request a feature or report a bug](#feedback--requests)** at the bottom.

Legend: ✅ Shipped · 🚧 In progress · 🔜 Next · 💡 Planned

---

## ✅ Recently shipped

### Language tags: any BCP 47 tag, one canonical form (v0.18.13, #107 #109 #111 #112 #113 #114 #115 #116)
- The six-language `<select>` for labels, definitions and notes, the import dialog's separate 16-language list, and the free-text scheme default language are replaced by **one language-tag field**: a compact box that opens a `code · Name` dropdown filtering as you type, by code or by name (`nl` and `Dutch` both find Dutch). The scheme default and every tag already in use list first, then all 183 ISO 639-1 codes. Any valid BCP 47 tag can be typed — `nl-BE`, `zh-Hant`, a three-letter ISO 639-2/3 code — and a non-tag such as `english` is rejected with the previous value restored. Names come from the browser's `Intl.DisplayNames`, so the app stays offline and CSP-clean. Requested by @tom-around for German preferred labels (#107); contributed by @abaronbo (#109, #112).
- **Canonicalisation does only what BCP 47 specifies** (#111): letter case (language lowercase, script Titlecase, region UPPERCASE) and the IANA registry's Preferred-Value for the five deprecated two-letter codes (`iw`, `in`, `ji`, `jw`, `mo`). It never changes the language — `tl` stays Tagalog rather than becoming `fil`, `cmn` stays `cmn`. An earlier pass had applied CLDR aliases, which did. A tag field commits only when its text changed, so tabbing through an imported `EN` label leaves it alone; the dropdown ranks a language whose name matches above a bare three-letter code, so typing `ger` offers `de · German` first.
- **One canonical form everywhere** (#116): `Core.canonLangTag` lives in the engine, so RDF import, spreadsheet import, the editor field and the validator agree. A stored tag that isn't canonical raises a validation warning that shows the canonical form. An imported `EN` and a typed `en` now count as one language in the one-prefLabel-per-language check, the tree filter and the "in use" list (#113). `dcterms:title` and `dcterms:description` each have a language field of their own, blank meaning the scheme language, so a German title on an English vocabulary no longer re-exports as `@en` (#114). An agent's `foaf:name` may take a tag (#115). Document titles and comments in the Sources tab use the same field, and the scheme's default-language field is the single authority for captions and export (#112).

### Deleting or renaming a concept updates successor links and collection members (#108)
- Deleting a concept cleared it from every other concept's broader, related and ISO 25964 relations, but not from deprecated concepts' `dcterms:isReplacedBy` lists or from collection members; renaming remapped members but not successors. The workspace was left with a dangling successor that Validate reported as an error and the Collections tab showed as a red "(missing)" leaf. Delete and rename now treat every relation the same way. The "(missing)" rendering stays, for imported files that reference concepts outside the workspace. Contributed by @abaronbo.

### Large vocabularies load and navigate in milliseconds (v0.18.12, #105)
- Importing and navigating a ~9,000-concept vocabulary (the reporter used the Dutch **IMBOR** thesaurus, 8,948 concepts) took tens of seconds because three core operations were **O(n²)**: the tree helpers `childrenOf`/`descCount` re-scanned every concept per rendered node; `selectConcept` rebuilt the entire tree on every click; and the Validate pass re-scanned all concepts to decide whether each one had narrower. All three are now **O(n)** — the tree builds a parent→children map and memoized subtree sizes once per render, selecting an already-visible node just moves the highlight instead of rebuilding, and validation precomputes the "has-narrower" set once. On a synthetic 9,000-concept vocabulary: tree render **5,305 ms → ~14 ms**, full validation **5,034 ms → ~50 ms**, navigate to a concept **5,114 ms → ~30 ms** — with identical output (same tree, same descendant counts, same 181 validation findings). Reported by @mickbaggen.

### Glossary promotion lands in the open taxonomy and honors the parent you chose
- Promotions were written into whatever taxonomy the candidate *list* was linked to, which could differ from the one open and exported — the ✓ marks showed done while the open scheme stayed empty. Promotion now targets the **open** taxonomy; if the list is linked elsewhere, the editor stops and asks: relink and promote here, or cancel with nothing written. Separately, the parent pickers filled their options lazily on open, which a native `<select>` doesn't render in time, so every promoted term landed as a top concept whatever you picked. Options now fill up front (per-row pickers for taxonomies up to 400 concepts), so the chosen parent is honored.

### UUID identifiers are RFC 9562 UUIDv7 in canonical dashed form
- The opaque-identifier option minted a 32-character hex string from a v4 UUID with the dashes stripped — not the RFC 9562 canonical representation. **Assign UUIDs** now mints canonical **UUIDv7** (`8-4-4-4-12`, lowercase, dashed): time-ordered, so identifiers sort by creation and pair with the change log; hex and `-` are RFC 3986/3987 unreserved characters, so `base + uuid` stays a valid IRI and exports emit valid Turtle prefixed names. A pasted or imported UUID (32-hex or dashed, any case, `urn:uuid:` tolerated) is normalised on CSV import; readable slugs are untouched. A new **Re-canonicalize existing UUIDs** action rewrites UUIDs minted before the dashed form into canonical lowercase without changing their value — across concept ids, SKOS-XL label URIs, concept URI overrides and collection ids — so a vocabulary keeps its identity while its identifiers become standard. The scheme/identifiers panel was re-laid-out at the same time so long field captions no longer overflow their grid cells.

### Expanded SKOS integrity checks (v0.18.11, #102)
- The Validate tab now covers more of the SKOS Reference: **class disjointness** — a URI can't be both a `skos:Concept` and the `skos:ConceptScheme` (S9) or a `skos:Collection` (S37) — **alt-vs-hidden label disjointness** (S13, alongside the existing pref checks), and **mapping clash** — `skos:exactMatch` conflicting with `broadMatch`/`narrowMatch`/`relatedMatch` to the same target (S46), including the symmetric reverse direction for same-vocabulary targets. Imported collections from a foreign namespace now keep their original URI on export (round-trip parity with concepts). Contributed by @abaronbo. Label disjointness is compared per *exact literal* (case-sensitive per S13), so a legitimate casing variant like `altLabel` "hound" / `hiddenLabel` "Hound" is not flagged and the auto-fix never deletes it.

### Fix: SKOS-XL editor threw on every label (v0.18.10)
- With SKOS-XL enabled, the concept editor referenced `LABEL_FIELDS` — a constant that lives inside `core.js`'s closure and isn't in scope in the page — so rendering any label with a value threw a `ReferenceError`. Every concept showed "Couldn't render Preferred/Alternative labels" (empty Hidden labels didn't iterate, so they looked fine). Replaced with an inline `["pref","alt","hidden"]` check. Plain-SKOS mode was unaffected, which is why it slipped past earlier tests.

### Sources tab reworked to a tree + editor (v0.18.9)
- The Sources tab now matches Build: a tree on the left with collapsible **Documents** and **Agents** groups, counts, and a filter box, and a Source editor on the right. Renaming a document or agent re-keys it **in place** — it keeps its row and its position in the export instead of jumping to the end — and scheme creator/contributor/publisher references follow the rename. The agent editor shows its scheme role. No change to the exported RDF. Contributed by @abaronbo (#98).

### Delete a branch: keep the children or delete them all (#87)
- Deleting a concept with concepts below it now asks which you mean: **Delete, keep children** removes only that concept (its children become top concepts and keep everything below them), or **Delete all** removes the whole branch. A descendant that also sits under a parent outside the branch is kept either way. Bulk delete offers the same choice, and ⌘/Ctrl+Z undoes both. Contributed by @abaronbo.

### Malformed label data is repaired on load, not just isolated (v0.18.8)
- A concept whose stored `pref`/`alt` (or any label/note) had a bad entry — a `null` in the list, or a field saved as a non-array — made the label renderer throw. The fault-tolerant editor caught it and showed a "Couldn't render 'Preferred labels' — re-enter to repair" notice, but the underlying data stayed broken. A project now runs a normalizer on load that coerces every label/note field to a clean array of `{val, lang}` (dropping nulls, wrapping stray strings), so the fields render correctly with no manual re-entry. Idempotent.

### Collections record change history like concepts (v0.18.7, #84)
- Editing a collection used to stamp `dcterms:modified` but leave no `skos:changeNote` — the audit trail concepts have had. Now editing a collection's name or note, toggling ordered, or adding/removing a member seeds a dated history entry that exports as `skos:changeNote` (tagged with the scheme default language). Imported collection change notes round-trip. Closes the last of the collection/concept parity gaps after #58.

### Change-note repair now also fixes imported notes (v0.18.6, #81)
- The v0.18.5 migration only walked live edit history (`c.history`), so change notes a workspace had **imported** from an earlier export — stored as `skos:changeNote` literals in `c.changeNote` — kept their `@lang`-in-label and doubled attribution. That showed up as an apparent "date cutoff" (notes present at the last import were skipped). The migration now repairs both storage sites, so every stored change note is cleaned regardless of how it got there.

### Cleaner change-note prose: no `@lang` in labels, no doubled attribution (v0.18.5)
- **#77** — a label change note quoted the label with its language key glued on (`“Day Meal Plan@en”`). The diff still compares on the `val@lang` key, but the note now renders the plain label, adding a `(lang)` qualifier only when the language isn't the scheme default.
- **#78** — approving your own proposal named you twice (`(proposed by X) (by X)`). The proposer is now structured data on the history entry; the exporter renders one name when proposer and approver match, and `(proposed by A, approved by B)` when they differ.
- **Migration** — a one-time, idempotent pass on project load repairs both defects already stored in `history[].changes`, so existing workspaces stop exporting the old notes.

### The concept editor never blanks on one bad field (v0.18.4)
- A concept whose stored data had a malformed field (e.g. a legacy shape where an array was expected) made the editor throw while building the form, leaving only the URI heading visible and every other field missing. Each editor section now renders in isolation: a bad field shows a small inline notice naming it, and the rest of the form renders normally. After a field report on the software example.

### Namespace changes rebase every dependent URI (v0.18.3)
- Changing the concept scheme's **base namespace** (Build → Concept scheme settings) now rewrites every URI that was minted under the old base, so nothing is left behind — most importantly the stored **SKOS-XL label URIs**, which previously kept the old base (e.g. a leftover `example.org` after you set your real namespace) while concept URIs moved. The concept scheme URI and the agents/documents annex namespaces are rebased too; imported foreign URIs and an explicitly-set scheme URI are left untouched. After a field report of `example.org` leaking into published SKOS-XL output.

### Consistent language tags, deprecation, and a consumer change log (v0.18.0–v0.18.2)
- **Concept lifecycle** — mark a concept `owl:deprecated` and point it at its successor(s) with `dcterms:isReplacedBy`; retired concepts keep their URIs and stay in the scheme. New lint checks flag a deprecated top concept, a dangling successor, or a deprecation with no successor.
- **Change-log export** — Export tab → *Change log* rolls the recorded edit history into a consumer-facing `CHANGELOG.md` (Keep a Changelog style).
- **Language tags on all notes** — history-derived and imported change notes now inherit the scheme default language on export, matching manually-tagged notes (#71).
- **Security hardening** — REST API no longer returns exception detail to clients; RDF/XML import rejects a DOCTYPE (entity-expansion guard); crosswalk/nav HTML sinks fully escape imported labels.

### Collections stamp their modifications (v0.17.3)
- Editing a collection — its names, notes, type, or members — now stamps `dcterms:modified`, the same discipline concepts have had since v0.7. Collections predating v0.17.0 carry no dates and none are invented for them (the editor never fabricates provenance): they gain a `modified` stamp the first time they're actually edited, and `created` stays absent by design. Documented, after a field report showed the absence reads as a bug.

### Collections polish from the field (v0.17.2, #67 #68 #69)
- **"Collection editor" heading (#67):** the Collections editor panel now carries the same card header the Concept editor has — the two halves of the screen finally read as siblings.
- **The way back (#68):** the concept editor gains a **Collections** group listing every collection the concept belongs to, as clickable chips that jump straight back to that collection in the Collections editor. Derived from the model — no extension property needed in your RDF. The importer additionally understands `uneskos:memberOf` (the UNESKOS inverse of `skos:member`), consuming it as membership; exports stay core SKOS and never emit the extension property.
- **Language tags on all annotation fields (#69):** collection **names and notes** are now language-tagged, multi-row editors (the first name per language exports as `skos:prefLabel`, further ones as `skos:altLabel`, per v0.17.0's collection export) — which also fixes a lurking bug where editing a collection's name silently discarded its other-language names. The concept scheme's title and description now display the language tag they export with.

### Export option: mirror preferred labels as rdfs:label (v0.17.1, #65)
- A new export option — **Also emit rdfs:label (generic RDF tools)** — mirrors each *preferred* label as `rdfs:label`, materializing `skos:prefLabel ⊑ rdfs:label` (SKOS Reference §5.2) for consumers without a reasoner: generic RDF browsers, LodView, a plain `?s rdfs:label ?l` query. In SKOS-XL mode the `skosxl:Label` resources are labelled too (their only text is otherwise `literalForm`, invisible to generic tools). **Off by default** — the default export stays pure SKOS labels. Deliberately scoped to preferred labels only: mirroring alt/hidden labels would blur ISO 25964's preferred/non-preferred distinction for naive consumers. Round-trips stay clean either way — a mirrored `rdfs:label` is recognized on import and never becomes a duplicate alternate name or collection label.

### Six-ticket batch (v0.17.0, #58–#63)
- **Collections export at parity (#58):** collections now carry `skos:prefLabel` (first label per language; further same-language labels become `skos:altLabel`, keeping the one-prefLabel-per-language integrity condition), `skos:inScheme`, and `dcterms:created`/`modified` (new collections are date-stamped; imported dates round-trip). `skos:note` stays — it is the honest property for a collection's free-text note.
- **Concept creator as a URI (#59):** a concept's `dcterms:creator` that names a registered agent now exports as that agent's URI — the same practice as the scheme's attribution. A URI value passes through as a URI; anything else stays a literal, and imports of either form round-trip.
- **Partitive entails broader (#60):** the published iso-thes ontology declares *all three* ISO 25964 specialisations subproperties of `skos:broader` — partitive included. `broaderPartitive` now asserts `skos:broader` like generic and instantial, so no ISO link exports without the hierarchy it entails; the same-parent dedup and editor guardrails extend to partitive automatically.
- **Downloadable validation report (#61):** Validate → **⬇ Report (Markdown)** writes the current findings as a checkbox work list — grouped by severity then by check, each item naming the concept and its identifier — so fixes can be worked through without bouncing between the editor and the report.
- **Mappings that target vocabulary terms (#62):** a new warning flags any `skos:*Match` whose target is a term of the metadata vocabularies (DC, FOAF, PROV, RDF(S), OWL, DCAT, SKOS itself) — a property or class is not a `skos:Concept`, and the slip otherwise surfaces only after publication.
- **Separate documents namespace (#63):** the annex namespace from v0.16.7 splits in two — **Agents namespace** and an optional **Documents namespace** that falls back to the agents one when blank (both blank keeps concept-namespace minting). `foaf:Document` sources mint under the documents namespace, declared as `@prefix resources:` in Turtle, `xmlns:resources` in RDF/XML, and a `resources` entry in the JSON-LD context.

### Glossary: no more silent promotions into the wrong taxonomy (v0.16.8)
- A glossary list stays linked to the taxonomy it was created under — so after switching projects, **Promote** quietly sent adopted terms into the *linked* taxonomy while the open scheme showed nothing. Now a prominent warning banner appears whenever the active list is linked to a different taxonomy than the one open (or is unlinked), with a one-click **Link to the open taxonomy**; and the promote confirmation names the destination taxonomy whenever it isn't the open one.

### Agents & documents namespace (v0.16.7, #57)
- Provenance resources — `prov:Person` / `prov:Organization` / `prov:SoftwareAgent` and `foaf:Document` sources — are metadata *about* the vocabulary, not members of it, yet they minted URIs inside the concept namespace: they dereferenced as terms, namespace-enumerating tools picked them up, and a concept and an agent could collide on one URI. A new optional scheme field, **Agents & documents namespace** (Build → scheme metadata), mints them elsewhere — slash or hash form both allowed, blank keeps the old behavior so existing projects are untouched. An explicit identity URI on an agent or document (ORCID, DOI, homepage) still always wins. The annex namespace is **declared like every other source namespace** — `@prefix agents:` in Turtle (subjects compact to `agents:Name`), `xmlns:agents` in RDF/XML, an `agents` entry in the JSON-LD `@context` — and imports under it round-trip losslessly.

### Fix: date literals valid and single-valued (v0.16.6, #55 #56)
- **Malformed date literals (#56):** an imported `dcterms:created`/`issued`/`modified` carrying a full timestamp landed verbatim in the concept's date field, and the next export typed it `xsd:date` — a dateTime lexical form outside `xsd:date`'s lexical space, rejected by Jena's `riot --validate` and SHACL. Dates are now reduced to their calendar-date part on import **and** defensively on export, so existing polluted files heal on their next round-trip.
- **Double created/modified values (#55):** the exporter emitted the editable date fields (`xsd:date`) *and* history-derived timestamps (`xsd:dateTime`) for the same properties — two `dcterms:created` per concept. The editable fields are now authoritative; history-derived stamps only fill in when no field is set. One value per property, always.

### Graph: connect a top concept to its scheme (v0.16.6)
- The concept-scheme bubble was visible in the graph but excluded from **Connect** mode — there was no way to link a concept to the scheme. Connecting a concept and the scheme (either click order) now offers **"top concept of the scheme"**, which marks it top (`skos:topConceptOf` / `skos:hasTopConcept` on export) with a history note. An explicitly marked top-concept edge can be removed in the inspector to unmark it; derived root edges remain informational.

### New check: unmarked top concepts (v0.16.5, #54)
- A concept with **no broader term (plain or ISO 25964) that isn't marked as a top concept** now raises a warning: it acts as a hierarchy root but exports without `skos:topConceptOf`, silently leaving the scheme's entry points incomplete. Comes with a one-click auto-fix ("Mark N unmarked root(s) as top concepts"). Deliberately distinct from the orphan warning — a concept with no relations at all stays an *orphan*, because auto-topping it would hide the real problem.

### Fix: crosswalk lines could fail to draw in a hidden tab (v0.16.4)
- The visual crosswalk drew its connection lines in a `requestAnimationFrame` callback, which browsers never fire while a tab is hidden — render the view with the tab backgrounded (or switch away at the wrong moment) and the mappings existed but no lines appeared until a manual re-render. A timed fallback plus a visibility-change hook now guarantee the lines draw.

### Fix: ISO 25964 relations now count as hierarchy everywhere (v0.16.3, #52 #53)
- The disconnected-components and orphan checks, the concept tree, Expand all, the Business view, collections arrangement, and the import health check all treated **only plain `skos:broader`** as hierarchy — a vocabulary linked through `iso-thes:broaderGeneric` (exactly what v0.16.1's dedup encourages) falsely validated as dozens of disconnected islands and rendered flat. All of them now count the ISO 25964 specialisations (generic, partitive, instantial) as hierarchy.
- The **Disconnected components** message is now readable (#52): it names the largest clusters by a representative concept ("61 concepts around 'Event'; …"), explains what an island is, and says plainly that it's informational.
- The ☰ menu's **Help** header now links to the documentation hub, and the item is labelled "Documentation hub" (#53).

### Fix: crosswalk lines invisible for federated (foreign-namespace) concepts (v0.16.2)
- Since v0.15, drawing a mapping stores the target concept's **real URI** — but the crosswalk's mapping detector still only recognized URIs under the target's base namespace. Mapping to a concept that keeps a foreign namespace (anything from a federated import) stored correctly yet showed **no line, no mapped marking, and a zero count**. The detector now matches by each target concept's real URI first (base-prefix as before), so lines, counts, per-pair exports, and click-to-remove all see every mapping again.

### Fix: duplicate `skos:broader` when an ISO relation entailed it (v0.16.1, #51)
- Setting both plain **Broader** and **Broader — generic (is-a)** to the same parent exported `skos:broader` twice: the ISO relation asserts its `skos:broader` super-property, and the exporter never deduplicated. The importer has had exactly this dedup rule since v0.8 — the exporter simply never got it. Fixed three ways: the export now emits **every triple exactly once** (a global guarantee, not just this case); a plain `skos:broader` that an entailing iso-thes field covers is skipped at the source, matching the importer's rule so round-trips agree; and the editor now prevents the redundant pair — picking a plain parent that a generic/instantial relation already covers is declined with an explanation, and adding a generic/instantial relation moves the plain entry rather than duplicating it. Partitive relations (which deliberately do *not* entail `skos:broader`) are unaffected. Existing projects with both fields set export clean without any user action.

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

- **Semantic Lair (RDF Wiki) beta.** The wiki downstream of this editor — upload a taxonomy or a federation export and tag documents against it — is being prepared for a beta. To be considered, email Hello@ontologypipeline.com with the subject "Semantic Lair beta".
- **Schema Binding — projection & mapping.** A shared, app-neutral engine ([`lib/schema-projection.js`](lib/schema-projection.js)) that projects the ontology model onto implementation targets and maps them back, through an **editable projection map**. Targets: **MongoDB** (`$jsonSchema`), **GraphQL** (SDL), **SwiftData** (`@Model`), **Obsidian** (frontmatter). The engine is built and tested (project-out for all four, round-trip for the three importable ones); **next** is the in-app "Project schema" panel and the per-app IR adapters.

## 💡 Planned

- **Linked-data matching (DBpedia)** — a per-concept **Match to DBpedia** button in the concept editor's External mappings: send the preferred label to DBpedia's official Lookup service (directly from your browser — no account, no server), review scored candidates with clickable URIs, pick the SKOS mapping relation for each, and approve. Scoped and designed; **deliberately held** until the current stabilization pass (automated smoke testing, the shared-engine split) has had time to prove itself — correctness before features.
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
