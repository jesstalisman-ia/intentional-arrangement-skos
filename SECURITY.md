# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — don't open a public issue.

- Email **Hello@ontologypipeline.com** with "SECURITY" in the subject, or
- Use GitHub's **[private vulnerability reporting](https://github.com/jesstalisman-ia/intentional-arrangement-skos/security/advisories/new)** (Security tab → Report a vulnerability).

Include what you found, how to reproduce it, and the impact you expect. I'll acknowledge
within a few business days and keep you posted on a fix.

## What's in scope

- **The browser app** (`app/index.html`) — runs entirely in the visitor's browser and keeps
  its data in local storage. It uploads nothing on its own. Things worth reporting: a way to
  exfiltrate a user's taxonomies, script injection through imported RDF or a share link,
  or a bypass of the local passcode gate (note: that gate is a convenience lock, not
  encryption, and is documented as such).
- **The REST API** (`api/`) and **MCP server** (`mcp-server/`) — they parse untrusted RDF with
  rdflib/pySHACL. Parser crashes, resource-exhaustion, or SSRF-style issues are in scope.
- **The optional Fuseki integration** — the app talks to a server *you* run; how you secure
  that server (CORS, auth, HTTPS) is on your side, and [docs/hosting-fuseki.md](docs/hosting-fuseki.md)
  covers hardening it.

## Not vulnerabilities

- The local passcode being reversible from local storage — by design, it's not encryption.
- A very long share link failing in some browser — a documented size limit, not a security bug.

## Supported versions

Fixes land on `main` and go out in the next release. Please test against the latest before reporting.
