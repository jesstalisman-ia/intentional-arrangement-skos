# Publishing to a server (Apache Jena Fuseki)

The editor works entirely in your browser — no server needed. But if you connect an
[Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/) triplestore, you get
two things the browser can't do on its own:

- **Publish** a taxonomy to the server and share a **short link** (`?g=…`) that loads it
  back — no size limit, unlike the self-contained share link.
- A place your taxonomies live that's **SPARQL-queryable** by other tools.

Everything else keeps working offline. The server is optional power, not a dependency.

## Run Fuseki

The quickest way is Docker:

```bash
docker run -d --name fuseki -p 3030:3030 \
  -e ADMIN_PASSWORD=change-me \
  stain/jena-fuseki
```

Then open `http://localhost:3030`, sign in, and **create a dataset** (e.g. named `skos`,
type *persistent (TDB2)*). Its URL is `http://localhost:3030/skos` — that's what you paste
into the app.

Or download the [Fuseki distribution](https://jena.apache.org/download/) and run
`./fuseki-server --update --loc=DB /skos` (needs Java 17+).

## Allow the app to reach it (CORS)

Because the app is a web page on a different origin, Fuseki must send CORS headers.
Fuseki 4.x ships a CORS filter; enable it in the dataset's config or run behind a reverse
proxy that adds:

```
Access-Control-Allow-Origin: https://jesstalisman-ia.github.io   # or your app's origin
Access-Control-Allow-Methods: GET, PUT, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Accept
```

For local experiments, `*` is fine; **lock it to your app's origin before any real
deployment.**

## Connect it in the app

1. Open the **Export** tab → **⚙ Connections…**.
2. Paste your dataset URL (e.g. `http://localhost:3030/skos`).
3. **Test connection** (it runs a SPARQL `ASK{}`), then **Save**.

## Publish & share

- **Export → ⤴ Publish to server** writes the current taxonomy to a named graph
  (`https://iaskos.app/g/<id>`) via the SPARQL **Graph Store Protocol** and copies a short
  link like `…/?g=<id>&s=<your-server>`.
- Opening that link loads the taxonomy **from the server** into a read-only Business view
  (with **Save a copy to edit**). The link carries the server URL (`s=`) so a recipient
  doesn't need to configure anything — they just need network access to your Fuseki.

## Which store?

Fuseki is the simplest fit — one container, the Graph Store Protocol, cheap to run (even
free on an always-free cloud VM). For very large reference vocabularies served read-only,
[QLever](https://github.com/ad-freiburg/qlever) is faster; for versioning and permissions,
[Fluree](https://flur.ee/) adds governance. The app talks plain HTTP, so other backends can
be added as adapters later.

## Security

This is meant for local or trusted-network use as shipped. Before exposing it publicly:
restrict CORS to your origin, put Fuseki behind HTTPS and authentication, size-cap and
expire published graphs, and treat uploaded RDF as untrusted input.
