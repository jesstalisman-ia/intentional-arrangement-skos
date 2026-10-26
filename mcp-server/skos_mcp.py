#!/usr/bin/env python3
# Intentional Arrangement SKOS Editor © 2026 Contextually LLC (d/b/a Ontology Pipeline)
# Size-based source-available license: Apache License 2.0 for organizations under 75
# employees; a written enterprise license is required at 75+ (Hello@ontologypipeline.com).
# Not an OSI-approved open-source license. See LICENSE / NOTICE.
"""
Intentional Arrangement SKOS — MCP server

Exposes the SKOS engine as Model Context Protocol tools, so an assistant like
Claude can *ground* on your vocabulary work: validate a taxonomy, convert
between serializations, or profile it before trusting it as context. Same
engine as the REST API (api/skoslib.py) — one source of truth.

    pip install -r requirements.txt
    python skos_mcp.py            # stdio transport

Register it with an MCP client (e.g. Claude Desktop / Claude Code):
    {
      "mcpServers": {
        "skos": { "command": "python", "args": ["/abs/path/mcp/skos_mcp.py"],
                  "env": { "IA_SKOS_FILES": "/abs/path/to/your/vocabularies" } }
      }
    }

Two ways to hand a vocabulary to a tool:
  * `rdf` — the document as text. Practical up to a few hundred kilobytes; a
    370 KB Turtle file is about 100k tokens, too much for a model's tool call.
  * `file_path` — a file on this machine. Only available when IA_SKOS_FILES names
    the directory (or directories, separated by the OS path separator) the
    server may read; a path outside them is refused. Nothing else on disk is
    reachable, and the server never writes outside those directories either.
"""
import os
import sys

# reuse the shared engine in ../api
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api"))
import skoslib  # noqa: E402

# The SDK renamed FastMCP -> MCPServer in mcp 2.0; support both.
try:
    from mcp.server import MCPServer as _Server  # mcp >= 2.0
except ImportError:  # pragma: no cover
    from mcp.server.fastmcp import FastMCP as _Server  # mcp 1.x

mcp = _Server("intentional-arrangement-skos")

MAX_FILE_BYTES = 64 * 1024 * 1024
_EXT_HINT = {".ttl": "turtle", ".turtle": "turtle", ".rdf": "xml", ".xml": "xml", ".owl": "xml",
             ".jsonld": "json-ld", ".json": "json-ld", ".nt": "nt", ".rj": "rdf-json"}


def _allowed_dirs():
    raw = os.environ.get("IA_SKOS_FILES", "")
    return [os.path.realpath(p.strip()) for p in raw.split(os.pathsep) if p.strip()]


def _safe_path(path, must_exist=True):
    """Resolve a path and refuse it unless it lies inside one of the IA_SKOS_FILES directories."""
    dirs = _allowed_dirs()
    if not dirs:
        raise ValueError("file_path is switched off: set the IA_SKOS_FILES environment variable to the directory "
                         "(or directories, separated by the OS path separator) this server may read.")
    real = os.path.realpath(os.path.expanduser(str(path)))
    if not any(os.path.commonpath([d, real]) == d for d in dirs):
        raise ValueError("file_path must be inside IA_SKOS_FILES; this path is not.")
    if must_exist and not os.path.isfile(real):
        raise ValueError("file_path does not name a file inside IA_SKOS_FILES.")
    return real


def _input(rdf, file_path, fmt):
    """The document bytes and a format hint, from the text argument or from an allowed file."""
    if file_path:
        real = _safe_path(file_path)
        if os.path.getsize(real) > MAX_FILE_BYTES:
            raise ValueError(f"file is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB.")
        with open(real, "rb") as f:
            data = f.read()
        hint = fmt or _EXT_HINT.get(os.path.splitext(real)[1].lower())
        return data, hint
    if not rdf:
        raise ValueError("pass the vocabulary as `rdf` (text) or as `file_path` (a file inside IA_SKOS_FILES).")
    return rdf, (fmt or None)


@mcp.tool()
def validate_skos(rdf: str = "", format: str = "", detail: str = "summary", file_path: str = "") -> dict:
    """Validate a SKOS vocabulary, qSKOS-style.

    Runs the SKOS integrity SHACL shapes (one prefLabel per language [S14],
    prefLabel/altLabel/hiddenLabel disjointness [S13], related-vs-broader
    disjointness [S27], concept/scheme/collection disjointness, scheme
    membership, typed unique notations, documentation, label conflicts and
    whitespace, one-way skos:related) plus structural checks (cyclic hierarchy,
    orphan concepts) and a documentation-coverage profile.

    Args:
        rdf: the vocabulary as text (Turtle, RDF/XML, JSON-LD, N-Triples or RDF/JSON).
        format: optional hint — turtle | xml | json-ld | nt | rdf-json (auto-detected if blank).
        detail: "summary" (default) groups the SHACL results by shape and severity, each
            message once with its focus nodes, and omits the text report; "full" lists every
            result with its focus node, label, path and message, plus pySHACL's text report.
        file_path: read the vocabulary from this file instead of `rdf`. Only inside the
            directories named by the IA_SKOS_FILES environment variable; use it for anything
            too large to pass as text.
    Returns: shacl_results (structured), structural_findings, profile (with shacl counts and
        sound), and summary: violations and warnings count SHACL and structural findings
        together; info is counted separately; shacl_conforms keeps pySHACL's meaning (false
        whenever any result exists, info included); no_violations is the severity-aware flag.
    """
    data, hint = _input(rdf, file_path, format)
    return skoslib.validate_rdf(data, hint, detail)


@mcp.tool()
def convert_skos(rdf: str = "", to: str = "turtle", from_format: str = "", file_path: str = "", out_path: str = "") -> str:
    """Convert a SKOS/RDF document to another serialization.

    Args:
        rdf: the source document as text.
        to: target format — turtle | rdf/xml | json-ld | n-triples | rdf/json.
        from_format: optional source hint (auto-detected if blank, or from the file's extension).
        file_path: read the source from this file instead of `rdf` (inside IA_SKOS_FILES only).
        out_path: write the result to this file (inside IA_SKOS_FILES only) and return a short
            confirmation instead of the whole document; the way to convert a large file.
    Returns: the converted document as text, or the confirmation when out_path is given.
        An unsupported target raises with the list of supported ones.
    """
    data, hint = _input(rdf, file_path, from_format)
    text, _mime, ext = skoslib.convert_rdf(data, to, hint)
    if out_path:
        real = _safe_path(out_path, must_exist=False)
        with open(real, "w", encoding="utf-8") as f:
            f.write(text)
        return f"written: {real} ({len(text.encode('utf-8'))} bytes, .{ext})"
    return text


@mcp.tool()
def skos_profile(rdf: str = "", format: str = "", file_path: str = "") -> dict:
    """Profile a SKOS vocabulary before trusting it as grounding context.

    Reports concept count, documentation coverage, number of top concepts,
    structural findings (cycles, orphans), the SHACL results grouped by shape
    with counts by severity, and `sound`: true only when nothing is at
    violation level, SHACL or structural. A vocabulary with sound=false should
    be validated and fixed before an answer is grounded on it.

    Args:
        rdf: the vocabulary as text.
        format: optional format hint (auto-detected if blank).
        file_path: read the vocabulary from this file instead of `rdf` (inside IA_SKOS_FILES only).
    """
    data, hint = _input(rdf, file_path, format)
    return skoslib.profile_rdf(data, hint)


@mcp.tool()
def parse_skos_vocabulary(rdf: str = "", format: str = "", file_path: str = "", scheme: str = "", query: str = "",
                          lang: str = "", detail: str = "concepts", limit: int = 200, offset: int = 0) -> dict:
    """Read a SKOS vocabulary and return its content as plain data, to ground on.

    Returns the schemes (title, description, size, top concepts), counts (concepts,
    schemes, collections, languages, triples) and a page of concepts, each with uri,
    label, notation, broader and, from detail "concepts" up, altLabels, definition,
    scopeNote, narrower, related, inScheme and top. Concepts are sorted by notation,
    then label.

    Args:
        rdf: the vocabulary as text (Turtle, RDF/XML, JSON-LD, N-Triples or RDF/JSON).
        format: optional hint (auto-detected if blank, or from the file's extension).
        file_path: read the vocabulary from this file instead of `rdf` (inside IA_SKOS_FILES only).
        scheme: keep only the concepts of this scheme: its IRI, or a part of its IRI or title.
        query: keep only concepts whose preferred, alternative or hidden label, or notation,
            contains this text (case-insensitive). The way to look one concept up.
        lang: preferred language for the single label and the notes (falls back to en, then any).
        detail: "counts" (schemes and counts only), "labels" (a compact index: uri, label,
            notation, broader), "concepts" (default), or "full" (every note and mapping, labels
            in every language, deprecation).
        limit, offset: paging; limit is capped at 2000. The response says the total and the
            next offset, so a large vocabulary is read in pages, each small enough for a tool call.
    """
    data, hint = _input(rdf, file_path, format)
    return skoslib.parse_vocabulary(data, hint, scheme=scheme or None, query=query or None, lang=lang or None,
                                    detail=detail, limit=limit, offset=offset)


if __name__ == "__main__":
    mcp.run()
