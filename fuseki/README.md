# Ready-to-run Fuseki

Apache Jena Fuseki isn't bundled with the editor — it's a separate server. This folder
stands one up in a single command, with CORS already configured so the browser app can
talk to it.

## Run it

```bash
cd fuseki
FUSEKI_ADMIN_PASSWORD=pick-a-password docker compose up -d
```

That starts two containers:

- **Fuseki** with a persistent dataset served at `/skos`.
- **Caddy** in front on port `3030`, adding the CORS headers Fuseki doesn't send.

## Connect the app to it

- **SKOS editor:** open the **Export** tab → **⚙ Connections…** → paste `http://localhost:3030/skos` → **Test** → **Save**. Then **⤴ Publish to server**.
- **Ontology Studio:** click **⤓ Export ▾** → under **Server (Jena Fuseki)** → **⚙ Connect Fuseki…** → same URL → **Save**, then **⤴ Publish to server**.

Publishing writes your taxonomy to a named graph and copies a short `?g=…` link that loads
it back from the server.

## Query what you published

Each project is stored in **its own named graph** (`https://iaskos.app/g/<project>`), so
projects stay separate. Two things follow from that:

- `config.ttl` turns on a **union default graph**, so a plain query still sees everything:
  ```sparql
  SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100
  ```
  Without the union setting, a plain `?s ?p ?o` reads only the (empty) default graph and
  returns nothing — the data would sit unseen in the named graphs.
- **List your projects:** `SELECT DISTINCT ?g WHERE { GRAPH ?g {} }`
- **Query one project only:** `SELECT * WHERE { GRAPH <https://iaskos.app/g/…> { ?s ?p ?o } }`

## Local vs hosted

- **Locally**, run the *app* over `http://` too (e.g. `python3 -m http.server` in `app/`).
  A page served over `https://` (like the GitHub Pages demo) can't call `http://localhost`
  — browsers block that "mixed content." Same-scheme, no problem.
- **Hosted**, put this behind HTTPS (Caddy does automatic certificates if you give the
  site block a real domain instead of `:3030`) and restrict `Access-Control-Allow-Origin`
  to your app's origin.

## Lock it down before exposing it

As shipped this is meant for local or trusted-network use:

- Change `FUSEKI_ADMIN_PASSWORD`.
- Narrow CORS from `*` to your app's origin in the `Caddyfile`.
- Front it with HTTPS and, if writes should be restricted, Fuseki auth.
- Treat uploaded RDF as untrusted input; consider size-capping and expiring published graphs.

See [../docs/hosting-fuseki.md](../docs/hosting-fuseki.md) for the full story.
