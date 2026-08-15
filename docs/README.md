# Documentation

Everything for building, using, hosting, and integrating the Intentional Arrangement SKOS editor. New here? Read the three under **Start here**, in order.

Use the tool now at **https://jesstalisman-ia.github.io/intentional-arrangement-skos/**.

## Start here

- **[Install & run](install.md)** — use it hosted, run the single file locally, or deploy your own copy.
- **[Using the editor](using-the-editor.md)** — the full workflow, tab by tab: collect candidate terms in the Glossary, author concepts (plain SKOS or SKOS-XL), review Proposals, validate, browse, visualize, query with SPARQL, and export.
- **[SKOS reference](skos-reference.md)** — the constructs and integrity conditions you actually use, with links to the W3C spec, qSKOS, Z39.19, and ISO 25964.

## Working in the tool

- **[Your workspace](workspace.md)** — the passcode, projects, guided Dublin Core setup, and autosave.
- **[Building a taxonomy in a spreadsheet](spreadsheet-import.md)** — the CSV/Excel format, with a fill-in [template](templates/skos-import-template.xlsx) and a walkthrough.

## Automate & integrate

Run the same engine outside the browser — in a script, a pipeline, or an AI assistant.

- **[REST API](../api/README.md)** — `POST /validate` and `POST /convert` over Flask + rdflib + pySHACL.
- **[MCP server](../mcp-server/README.md)** — `validate_skos`, `convert_skos`, `skos_profile` as Model Context Protocol tools.

## Build & understand the tool

- **[How to build a SKOS taxonomy editor](how-to-build-a-skos-taxonomy-editor.md)** — the essay on how this was made.
- **[Code walkthrough](skos-editor-code-walkthrough.md)** — a tour of the single-file source.

## Project

- **[Roadmap](../ROADMAP.md)** — what's shipped, in progress, and planned.
- **Request a feature** → [feature request](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml) · **Report a bug** → [bug report](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml) · **Email** → Hello@ontologypipeline.com

---

*The editor and its example taxonomy are © 2026 by Jessica Talisman, licensed [CC BY-ND 4.0](../LICENSE). Taxonomies you create with the tool are your own.*
