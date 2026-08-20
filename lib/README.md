# Schema Binding — shared projection engine

`schema-projection.js` projects an ontology model onto implementation-target schemas,
and maps those schemas back, through an **editable projection map**. It is
transport-neutral: it works on a small intermediate representation (IR), so it can be
embedded in both the SKOS editor and the Ontology Studio without depending on either
app's internal model. Plain browser JS (also loads under Node/CommonJS for tests).

## Targets

| Target | Project out | Map in |
|---|---|---|
| **MongoDB** (`$jsonSchema` collection validator) | ✅ | ✅ |
| **GraphQL** (SDL types) | ✅ | ✅ |
| **SwiftData** (`@Model` classes) | ✅ | out-only |
| **Obsidian** (frontmatter property template) | ✅ | ✅ |

## The IR

```js
{
  namespace: "http://example.org/onto#", prefix: "ex",
  classes: [{
    id, label, comment, parents: [classId],
    properties: [{
      id, label, comment,
      kind: "data" | "object",
      range: "<xsd datatype>" (data) | "<classId>" (object),
      required: bool,   // min cardinality >= 1
      multiple: bool    // max cardinality > 1
    }]
  }]
}
```

Each app supplies a tiny `toIR(model)` / `fromIR(ir)` adapter; the engine does the rest.

## The projection map (editable, auto-defaulted)

```js
{
  target: "mongo"|"graphql"|"swiftdata"|"obsidian",
  classes: {
    [classId]: {
      include: true, name: "TargetTypeName",
      properties: { [propId]: { include, name, type, required, multiple } }
    }
  }
}
```

Only overrides need to be stored. `resolveMap(ir, target, saved)` merges a saved map
onto a fresh default, so renames/exclusions survive model changes without going stale.

## API

```js
const SP = globalThis.SchemaProjection;           // or require("./schema-projection.js")
SP.targets            // ["mongo","graphql","swiftdata","obsidian"]
SP.importable         // ["graphql","mongo","obsidian"]
SP.defaultMap(ir, target)
SP.project(ir, target, savedMap?)   // -> artifact string
SP.parse(target, text)              // -> IR   (importable targets only)
```

## Datatype mapping

xsd datatypes map per target (string/integer/decimal/boolean/date/anyURI…). Object
properties become references: Mongo `objectId`, GraphQL object type, SwiftData
`@Relationship`, Obsidian a `link → Class` list. Cardinality drives arrays and
required/optional. See `TYPEMAP` in the source.

## Status

The engine is complete and tested (project-out for all four targets, round-trip for the
three importable ones, editable-map overrides). **UI wiring into the apps is the next
step** — each app adds a small IR adapter and a "Project schema" panel.
