# Getting started — a runbook

A plain, follow-along guide to setting up **Intentional Arrangement SKOS**: the fastest way in, what you can run locally, and how the tool behaves in each case. No prior setup assumed.

## The 30-second version

The whole editor is **one web page**. You can just open it — nothing to install, no account. Your work saves itself in your browser and never leaves your machine unless you export it or publish it on purpose. Everything below is about *where* you run that page and *how much* of the optional toolkit you turn on.

---

## Three ways to run it

| | Best for | Needs | Data lives |
|---|---|---|---|
| **A. Hosted in your browser** | Trying it, everyday use | Nothing — just a browser | Your browser |
| **B. Local file** | Offline, air-gapped, or "keep a copy" | The one HTML file | Your browser |
| **C. Local full toolkit** | Validation service, publishing to a server, automation | Python (and Docker for publishing) | Your browser + a server you run |

You do **not** need C to build taxonomies. A and B are the whole editor. C adds optional power.

### A. Hosted in your browser (start here)

1. Open **https://jesstalisman-ia.github.io/intentional-arrangement-skos/**
2. That's it. Create a project and start.

Works in any modern browser (Chrome, Edge, Firefox, Safari). Nothing is uploaded — see [How your data is stored](#how-your-data-is-stored).

### B. Local file (offline / your own copy)

1. Download the app file: from the repo, open `app/index.html` and save it (or download the repo as a ZIP and find `app/index.html` inside).
2. **Double-click it** to open in your browser. It runs the same offline.

That single file *is* the entire editor. Keep it on a shared drive, email it, put it on a USB stick — it works anywhere with a browser, no internet required.

> Prefer serving it (some browsers restrict file downloads opened directly): from a terminal in the `app` folder run `python3 -m http.server 8080`, then open `http://localhost:8080`.

### C. Local full toolkit (optional)

Turn this on only if you want the extra services:

- **Validation / conversion API** — a REST service that validates a vocabulary (SHACL + structural checks) and converts between RDF formats.
  ```bash
  cd api && pip install -r requirements.txt && python server.py     # http://127.0.0.1:8000
  ```
- **Assistant tools (MCP)** — exposes the same engine to Claude Desktop / Claude Code.
  ```bash
  cd mcp-server && pip install -r requirements.txt && python skos_mcp.py
  ```
- **Publish to a server (Fuseki)** — an optional triplestore so you can publish a taxonomy and share a link that loads it back. Built from the official Apache distribution:
  ```bash
  cd deploy && docker compose up -d --build     # http://localhost:3030
  ```
  Review [`deploy/README.md`](../deploy/README.md) first — it's optional and has a hardening checklist.

Full details: [Install & setup](install.md).

---

## How the tool works, installed vs. in the browser

Here's the thing that surprises people: **there is no "installed" version that behaves differently.** The editor is the same web page whether it's hosted, opened as a local file, or served locally. What changes is only what's *around* it:

- **In the browser (hosted or local file):** the full editor — build concepts, hierarchy, labels, collections, validate against qSKOS, visualize, import/export. All of it runs client-side.
- **With the local toolkit (option C):** the editor is unchanged; you've just added optional services it can talk to — the validation API, the assistant tools, and a Fuseki server to publish to.

So the decision isn't "which version" — it's "do I want the optional services running alongside." Most people never need them.

## How your data is stored

- Your taxonomies live in your browser's local storage, on your machine. **Nothing is uploaded.**
- **Autosave** — every change is saved as you work, with a "✓ Saved" tick.
- **Several projects at once** — create, rename, duplicate, switch, and delete from **Projects**.
- **Optional passcode** — a per-browser lock (a convenience lock, not encryption; nothing leaves the machine).
- **Moving work between machines / people** — use **Export** (Turtle, RDF/XML, JSON-LD, CSV, Excel, Markdown) and **Import** on the other side, or copy a read-only **share link** (the taxonomy rides inside the link).

> One consequence of "it's all in your browser": clearing your browser data clears your projects. Export anything you want to keep, or use the toolkit's publish option.

## Your first five minutes

1. Open the app (option A).
2. **Projects → New** — give it a title (only the title is required).
3. **+ Top concept** — add a top-level term; press **+** on a row to add a child.
4. Fill in a **preferred label**, a **definition**, maybe an **alternate label** (synonym).
5. **Export** (top right) → **Turtle** to save a standards file, or copy a **share link** to show someone.

## Getting help

- **Questions & ideas** → [Discussions](https://github.com/jesstalisman-ia/intentional-arrangement-skos/discussions)
- **Bugs & feature requests** → [Issues](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new/choose)
- **Email** → Hello@ontologypipeline.com
