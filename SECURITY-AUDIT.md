# Security & supply-chain audit

**Date:** 2026-08-30
**Scope:** dependency management, supply-chain integrity, and a review of the
security-relevant code paths in this repository.

This file records what was checked, what was changed, and — as importantly — what
was looked at and left alone, so the next audit starts from a known baseline
rather than from scratch.

## What now runs continuously

| | Owner | Cadence |
|---|---|---|
| Version update PRs | **Renovate** (`renovate.json`) | Weekly, Monday before 06:00 UTC |
| Security advisory PRs | **Dependabot** (`.github/dependabot.yml`) | Immediately on advisory |
| Pin / digest / SRI drift | **`security-audit` workflow** | Daily, 06:17 UTC |

The two bots are deliberately not doing the same job. Every Dependabot entry sets
`open-pull-requests-limit: 0`, which suppresses its routine version PRs while leaving
its advisory-driven PRs switched on. Without that split, both bots would open a PR
for every bump.

The daily workflow covers what neither bot watches: a base-image digest that has gone
stale, a pin quietly loosened back to a range, an action that slipped back to a mutable
tag, an SRI hash that no longer matches the published bytes. Findings collect into a
single issue that is updated in place and closed automatically when a run comes back
clean.

## Change: dependencies are now pinned exactly

**Severity: medium — a gap in coverage and reproducibility, not a vulnerability.**

Every requirement was an open range (`flask>=3.0`, `rdflib>=7.0`). What the two tools do
with that differs, and the distinction matters:

- **Dependabot does raise PRs against an open range**, widening the lower bound — this
  repository's own history shows it, in closed PRs titled
  "Update flask requirement from >=3.0 to >=3.1.3".
- **Renovate, on its default range strategy, leaves a satisfied range alone.** Nothing to
  replace when `7.6.0` already satisfies `>=7.0`, so those dependencies would have sat
  outside Renovate's coverage entirely.

So pinning is not what makes dependency management work — it is what makes both tools
see the same thing, and what makes a build reproducible: an unpinned range means the
version you deployed is whatever PyPI served that day, and is not recorded anywhere.

An earlier draft of this document claimed neither tool could act on `>=3.0`. That was
wrong about Dependabot, and is corrected here. The commit messages on this branch still
carry the original overstatement; rewriting them would mean rewriting published history,
so the correction lives here instead.

All requirements are now pinned with `==`. The daily audit re-checks this, so a pin
loosened back to a range is reported rather than quietly dropping that dependency out
of Renovate's tracking.

## Finding: the Fuseki base image was pinned to a stale digest (fixed)

**Severity: high.** `deploy/Dockerfile` pinned `eclipse-temurin:17-jre` by digest —
correct practice — but the tag had since moved to a newly built image and the pin had
not. Every build was reproducibly producing a container on a base image that no longer
matched upstream, missing whatever base-OS patches that rebuild carried. A digest pin
without a freshness check trades one risk for another.

Refreshed to `sha256:13cc28a6…`, verified as a like-for-like OCI index covering the same
six platforms. Renovate's Docker manager now raises this bump, and the daily audit fails
if the pin drifts from the live tag again.

### Why the tag stays `17-jre`

Renovate will offer to retag the base image to a point release (`17.0.20_8-jre`) or to
Java 25 (`25.0.4_7-jre`). Both are declined by an `allowedVersions` rule in
`renovate.json`, and deliberately so: a point-release tag stops moving, and the daily
audit's whole base-image check is "does the pinned digest still match what this tag
resolves to". Freeze the tag and that check quietly becomes a no-op — which is exactly
how the stale digest above went unnoticed in the first place. The tag stays floating;
the digest is pinned and Renovate keeps it fresh.

## Finding: Apache Jena version tracked in two places that could diverge (fixed)

`ARG FUSEKI_VERSION` in `deploy/Dockerfile` and the image tag in
`deploy/docker-compose.yml` both name the Fuseki version, and nothing kept them in step.
A Renovate custom manager now tracks both, so they move together. `FUSEKI_SHA512` still
has to be re-verified by hand against the Apache release — Renovate cannot compute a
tarball hash, and this is called out in the config so a bump PR is not merged blind.
## Finding: workflow actions pinned to mutable tags (fixed)

**Severity: medium.** `.github/workflows/pages.yml` used `actions/checkout@v4` and friends.
A tag is mutable: whoever controls an action repository can repoint `v4` at new code, which
then runs in this workflow with its token and `pages: write` / `id-token: write` permissions.

All four actions are now pinned to full commit SHAs with the human-readable version in a
trailing comment. The majors were *not* changed at the same time — newer majors exist
(checkout v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5) and Renovate
will propose them as reviewable PRs rather than having them bundled into a security fix.
The workflow's `permissions` block was already correctly scoped and was left alone.

## Finding: no CSP or transport-security headers (fixed)

`netlify.toml` set `X-Content-Type-Options` and `Referrer-Policy` but no Content-Security-Policy,
HSTS, or frame protection. Added: CSP, `Strict-Transport-Security`, `X-Frame-Options: DENY`,
and a `Permissions-Policy` turning off device APIs the editor never uses.

A matching CSP also went into `app/index.html` as a `<meta http-equiv>`, so the policy travels
with the file to GitHub Pages, which cannot set response headers at all.

Two deliberate loosenings, both documented in the config:

- `script-src` includes `'unsafe-inline'` — the app is one self-contained HTML file, so its
  own logic is inline. It still blocks *external* scripts, which is the injection vector that
  matters. `'unsafe-eval'` is **not** granted: the app contains no `eval` or `new Function`.
- `connect-src` is open — the SPARQL endpoint is typed in by the user at runtime and can be
  any host, so narrowing it would break the Fuseki sync feature outright.

Verified in Chromium: the app renders fully (20 top-level elements, 124 controls) with zero
CSP violations and zero page errors.

## Open — reported, not fixed

- **`innerHTML` is used in ~139 places** in `app/index.html`, some of them rendering values
  that originate in imported RDF/CSV. That is a DOM-XSS surface: a malicious label in an
  imported vocabulary could inject markup. The CSP blocks external script loads, which
  substantially limits what an injection can reach, but `'unsafe-inline'` means it does not
  stop inline execution. Converting these to `textContent`/`insertAdjacentText` where the
  value is untrusted is the real fix, and it is a focused refactor rather than part of a
  dependency change — worth its own piece of work.
## Reviewed and found sound — no change made

- **The Dockerfile.** Base image pinned by digest, Fuseki tarball verified by SHA-512
  before extraction, build tooling purged afterwards, and the server runs as a non-root
  user (uid 1001). This was already stronger than most; the only gap was digest freshness,
  above.
- **`docker-compose.yml`.** Bound to `127.0.0.1` only, no admin password baked in, and the
  image is built locally rather than pulled — so there is no third-party image to trust.
- **Credentials.** No secrets committed; a scan for key-shaped literals and for
  `.env`/`.pem`/`.key` files found nothing.

## Two steps that need a human

Neither can be done from a commit:

1. **Install the Renovate GitHub App** — <https://github.com/apps/renovate> — and grant it
   this repository. `renovate.json` does nothing until an app is watching the repo.
2. **Enable Dependabot alerts and security updates** in
   *Settings → Advanced Security* (or *Code security and analysis*). `dependabot.yml`
   configures Dependabot; it does not switch it on.
   **This one appears already done for this repository** — Dependabot has previously
   opened PRs here (#6–#15, since closed against a rewritten base), which it could not
   have done while switched off. Worth confirming rather than assuming.

The daily `security-audit` workflow needs neither, and starts working on the first push.

## Method

`pip-audit` against every resolved dependency set; a Renovate dry run
(`renovate --platform=local`) to confirm every manager matches real files; live registry
queries for base-image digest freshness; and a read of the security-relevant code paths.
Configuration was validated with `renovate-config-validator --strict` and by parsing every
YAML file. The Content-Security-Policy was verified by loading the app in Chromium and
confirming it renders with zero CSP violations and zero page errors.
