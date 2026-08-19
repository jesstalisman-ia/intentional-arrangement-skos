# deploy/ — optional Fuseki server

> ⚠️ **Optional. The editor does not need this.** The single-file app in `app/` runs on
> its own; this directory exists only for the app's opt-in **"Publish to server"** feature.
> **Review and harden every item below before deploying anywhere.** As shipped it binds to
> localhost only — a starting point for review, not a production config.

It lives in this repo on purpose: the risk that comes with running a triple store sits next
to the feature that uses one, where you'll see it — not hidden in a separate repo.

## What it builds

`Dockerfile` builds **Apache Jena Fuseki 5.6.0** from the official Apache distribution, pinned
two ways so the build is reproducible and auditable:

- the base image (`eclipse-temurin:17-jre`) by **digest**;
- the Fuseki tarball by **SHA-512**.

Jena 5.6.0 is past the fixes for **CVE-2025-49656** and **CVE-2025-50151** (both resolved in
5.5.0). `config.ttl` serves one dataset, `skos`, with a **union default graph** so a plain
`SELECT ?s ?p ?o` returns data the app publishes into per-project named graphs.

## Run it (local)

```bash
cd deploy
docker compose up -d --build
```

It listens on **`127.0.0.1:3030`** — your own machine, nothing else. Admin UI at
http://localhost:3030, dataset at http://localhost:3030/skos.

## Connect the app

Serve the app over http (`cd app && python3 -m http.server 8080`), then **Export →
Connections** → `http://localhost:3030/skos`. A page served over https can't call
`http://localhost` — same-scheme only.

## Query what you published

Each project is its own named graph; the union default graph lets plain queries see all of them:

```sparql
SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100                       # everything
SELECT DISTINCT ?g WHERE { GRAPH ?g {} }                           # your projects
SELECT * WHERE { GRAPH <https://iaskos.app/g/…> { ?s ?p ?o } }     # one project
```

## Before anyone else can hit it — hardening checklist

The defaults suit local review. Each of these is required before the server is reachable by
others, and mirrors the project's security assessment:

- [ ] **Version** — Jena **5.6.0** is pinned here (≥ 5.5.0, CVEs fixed). Re-check the advisory if you change it.
- [ ] **Pinned build** — base image by digest, Fuseki by SHA-512. Keep it that way; re-pin on upgrade.
- [ ] **Authentication** — Fuseki ships open. Put write access behind auth (Fuseki `shiro.ini`, or your reverse proxy / SSO). Never leave the update and Graph Store endpoints unauthenticated.
- [ ] **CORS** — Fuseki reflects the requesting origin. Restrict it to your app's origin at a reverse proxy (allow only `https://your-app-host`) instead of letting any page call the store.
- [ ] **Network** — keep the `127.0.0.1` bind, or front it with a reverse proxy and TLS on a segmented network. Don't publish `0.0.0.0:3030` to the internet.
- [ ] **Data** — published RDF is untrusted input; the dataset persists in the `fuseki-data` volume. Back it up, and size-cap or expire graphs for multi-tenant use.

## Security assessment

An external assessment reviewed this repo (commit `fb744ec`, 18 Aug 2026). Its Fuseki
conditions — verify Jena ≥ 5.5.0, pin the image, set a strong admin password, restrict CORS,
place behind authentication — are the checklist above. The app itself was found technically
safe, with network paths activating only by user action; this directory is the one part that
shifts that profile when deployed, which is why it's isolated here behind this banner.
