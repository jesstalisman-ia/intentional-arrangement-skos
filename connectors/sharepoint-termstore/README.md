# SharePoint Term Store → SKOS

Pull a SharePoint Online **Managed Metadata** term store into the editor as SKOS. A term
set becomes a `skos:ConceptScheme`, its terms become `skos:Concept`s with the hierarchy,
labels, synonyms, descriptions, and identifiers intact.

The mapping engine ([`termstore_to_skos.py`](termstore_to_skos.py)) never touches the
network — it converts a normalized dict to SKOS Turtle. Two things feed it: a live pull
from Microsoft Graph, or a saved JSON export. Same output either way.

## ⚠️ Disclaimer — provided as-is, no warranty, no liability

This connector is example/reference software, provided **AS-IS, WITHOUT WARRANTY OF ANY
KIND**, express or implied, including but not limited to merchantability, fitness for a
particular purpose, and non-infringement. It authenticates to and reads data from your
Microsoft 365 tenant, and **you alone are responsible** for: the Azure app registration
and the permissions you grant; how credentials and secrets are stored and rotated;
network exposure of the bridge service; and compliance with your organization's policies,
your Microsoft agreements, and any applicable law or regulation.

To the maximum extent permitted by law, **the author and copyright holder (Jessica
Talisman) accept no liability** for any claim, damage, data exposure, security incident,
service disruption, or other loss arising from the use of, or inability to use, this
connector — whether or not advised of the possibility. **Review the code and the security
checklist below, and test in a non-production tenant, before any live use. Use at your own
risk.** This notice is in addition to, and does not limit, the repository [LICENSE](../../LICENSE).

## How the pieces map

| SharePoint Term Store | SKOS / RDF |
|---|---|
| Term Set | `skos:ConceptScheme` |
| Term | `skos:Concept` + `skos:inScheme` |
| Top-level term | `skos:topConceptOf` (+ scheme `skos:hasTopConcept`) |
| Child term | `skos:broader` → parent (parent gets `skos:narrower`) |
| Default label, per language | `skos:prefLabel`@lang |
| Other labels / synonyms | `skos:altLabel`@lang |
| Description, per language | `skos:definition`@lang |
| Term GUID | concept URI + `dcterms:identifier` |
| `isDeprecated` | `owl:deprecated true` |
| Created / last modified | `dcterms:created` / `dcterms:modified` |
| Custom properties | `skos:note` `"key: value"` |

Language tags carry through as BCP-47 (`en-US`, `nl-NL`). Pass `--xl` to also emit
SKOS-XL `skosxl:Label` resources, which the editor round-trips.

## Install

```bash
cd connectors/sharepoint-termstore
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

Offline conversion needs only `rdflib`; the live pull adds `msal` + `requests`; the
bridge service adds `flask`.

## Use it

### A. Offline — convert an export (no tenant access)

Good for a first proof, or when IT will only hand you a file. Provide a Graph-shaped
JSON (see [`sample_termstore.json`](sample_termstore.json) for the shape; a PnP/CSOM
export can be reshaped into it):

```bash
python cli.py --from sample_termstore.json --base https://acme.sharepoint.com/terms/ -o acme.ttl
```

Then in the editor: **Import…** → choose `acme.ttl` → **Import**.

### B. Live — pull from Microsoft Graph

```bash
export SP_TENANT=<tenant-id-or-domain>
export SP_CLIENT_ID=<app-registration-client-id>

# delegated: a user signs in via a browser code prompt
python cli.py --mode device -o acme.ttl

# app-only: unattended (needs an admin-consented app + secret)
export SP_CLIENT_SECRET=<secret>
python cli.py --mode app -o acme.ttl
```

### C. Live sync — the bridge service

For "keep it in step" rather than one-off files. The service authenticates server-side
(so no tenant secret reaches the browser) and serves Turtle:

```bash
python server.py          # http://127.0.0.1:8020
# GET /sets            -> list term sets
# GET /skos.ttl        -> whole store as Turtle
# GET /skos.ttl?set=<id>&xl=1
```

Fetch `/skos.ttl` and import it, or wire a "Connect to SharePoint" fetch in the editor.

## Azure app registration (what IT sets up)

1. **Azure portal → App registrations → New registration.** Name it, single tenant.
2. **API permissions → Add → Microsoft Graph → `TermStore.Read.All`.**
   - **Delegated** (mode `device`): add it as a *delegated* permission. Each signing-in
     user needs access to the term store. No admin consent required if your tenant lets
     users consent; otherwise an admin grants it once.
   - **Application** (mode `app`): add it as an *application* permission and have an admin
     **Grant admin consent**. Then **Certificates & secrets → New client secret** for
     `SP_CLIENT_SECRET`.
3. For `device` mode, under **Authentication** enable **Allow public client flows**.
4. Hand over: the **tenant** id/domain and the **client (application) id** (plus the
   **secret** for app mode).

Read-only throughout — `TermStore.Read.All`, nothing that can change SharePoint.

## Security notes (before exposing the bridge)

The bridge as shipped binds to `127.0.0.1` and is unauthenticated with permissive CORS —
a starting point for review, not a deployment. Before anyone else can reach it:

- **Secrets** stay server-side (env or a secret store), never in the page or the repo.
- **CORS** — set `CORS_ORIGIN` to your editor's exact origin, not `*`.
- **Auth** — put the bridge behind your own auth / reverse proxy; it currently trusts any caller.
- **Least privilege** — `TermStore.Read.All` only; prefer delegated so access follows the user.
- **Network** — keep the loopback bind, or front it with TLS on a segmented network.
