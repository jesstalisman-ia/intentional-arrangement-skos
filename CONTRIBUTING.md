# Contributing

Thanks for wanting to help. Bug reports, feature ideas, and pull requests are all welcome —
several recent releases came straight from GitHub issues.

## Report a bug or request a feature

- **Bug** → [bug report](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=bug_report.yml)
- **Feature** → [feature request](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues/new?template=feature_request.yml)
- Browse [open issues](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues) first; a 👍 on one that matches yours helps it rise.

For anything security-related, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## How the app is built

The editor is **one self-contained file**: `app/index.html`. No build step, no dependencies,
no bundler. HTML, CSS, and JavaScript live in that file, and it runs by opening it in a browser.

- **Edit** `app/index.html` directly.
- **Try it** by opening the file, or serving it: `python3 serve.py 8080` → http://localhost:8080.
- The RDF engine (`Core`) sits in its own `<script>` block near the bottom; the app UI is the
  larger script above it. Keep new logic close to the code it touches, and match the surrounding
  style rather than introducing a framework.

The **`api/`** (Flask + rdflib + pySHACL) and **`mcp-server/`** are separate Python programs over
the same standards; each has its own `README.md` and `requirements.txt`.

## Pull requests

1. Fork and branch off `main`.
2. Keep the change focused — one feature or fix per PR.
3. If you touched the app, sanity-check it in a browser: open the file, run through the tab you
   changed, and confirm the export still validates (Validate tab or `api/` `POST /validate`).
4. Update the relevant doc in `docs/` if behavior changed.
5. Open the PR against `main` with a short description of what and why.

There's no CLA. By contributing, you agree your contribution is licensed under the project's
[size-based source-available license](LICENSE).

## Standards to keep in mind

This is a standards-first project. New SKOS behavior should match **W3C SKOS**, and where
relevant **ANSI/NISO Z39.19**, **ISO 25964**, and **DCMI**. When in doubt, cite the spec in the PR.

Questions? Open a [discussion or issue](https://github.com/jesstalisman-ia/intentional-arrangement-skos/issues), or email Hello@ontologypipeline.com.
