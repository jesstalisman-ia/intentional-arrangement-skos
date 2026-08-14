# Install and stand up the SKOS editor

The editor is one self-contained HTML file. There is nothing to compile, no packages to install, no database to run. It works offline and keeps your data in your own browser. That leaves you three ways to stand it up, from open-it-and-go to host-your-own-copy. Pick the one that fits.

## What you need

- A current browser — Chrome, Firefox, Safari, or Edge. That is the only hard requirement.
- Optional: Python 3, if you want to serve the file locally. Git, if you'd rather clone the repo than download a file. A free GitHub account, if you want to host your own copy for other people.

Your work is saved in the browser's local storage. Nothing is uploaded, there is no account, and no server sees your vocabulary.

## Option 1 — Use the hosted version (nothing to install)

Open it and start:

**https://jesstalisman-ia.github.io/intentional-arrangement-skos/**

This is the whole editor. Add concepts, validate, visualize, export. Your work stays in that browser on that machine.

## Option 2 — Run it on your own machine

Get the code:

```bash
git clone https://github.com/jesstalisman-ia/intentional-arrangement-skos.git
cd intentional-arrangement-skos
```

If you'd rather not use git, download `app/index.html` from the repo — that single file *is* the editor.

Now open it one of two ways:

- **Double-click `app/index.html`** to open it straight in your browser. Because the tool is self-contained, this works on its own.
- **Serve it** (cleaner URL, and edits show up on reload):

```bash
python3 serve.py
```

That serves the `app/` folder at `http://localhost:8080` with caching turned off. It uses only the Python standard library — no `pip install` needed. To pick a different port: `python3 serve.py 8090`.

## Option 3 — Host your own copy (to give other people a link)

Fork the repo and turn on GitHub Pages. The fork already carries the workflow that publishes the `app/` folder for you.

1. **Fork** https://github.com/jesstalisman-ia/intentional-arrangement-skos to your own account.
2. Keep the fork **public** — GitHub Pages is free for public repositories.
3. In the fork: **Settings → Pages → Build and deployment → Source: GitHub Actions.**
4. Push any commit to `main` (or re-run the workflow from the Actions tab). Your copy goes live at `https://<your-username>.github.io/intentional-arrangement-skos/`.

Prefer Netlify? The repo includes a `netlify.toml` that points the publish directory at `app/`, so importing the repo in Netlify is a one-click deploy — then add a custom domain in the dashboard if you want one.

## Check that it works

However you started it, confirm it's alive: click **Import…**, paste the small example below, and **Import & replace**.

```turtle
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix ex:   <http://example.org/> .
ex:animals a skos:Concept ; skos:prefLabel "Animals" .
ex:dog a skos:Concept ; skos:prefLabel "Dog" ; skos:broader ex:animals .
```

You should see two concepts, with Dog under Animals. Now open **Export** and save it as Turtle — that round-trip proves the editor is standing up correctly.

## Optional: the API and MCP server

The browser editor is the whole tool. If you also want to validate or convert vocabularies *outside* the browser — in a script, a pipeline, or an AI agent — the repo ships a REST API (`api/`) and an MCP server (`mcp-server/`). Those do need Python packages; their setup is in the [README](../README.md) and each folder's own README.

---

Next: [your workspace — passcode, projects, and autosave](workspace.md), [building a taxonomy in a spreadsheet](spreadsheet-import.md), and the [SKOS reference](skos-reference.md).
