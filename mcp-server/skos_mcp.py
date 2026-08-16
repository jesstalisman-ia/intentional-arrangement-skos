#!/usr/bin/env python3
# Intentional Arrangement SKOS Editor © 2026 Jessica Talisman
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
        "skos": { "command": "python", "args": ["/abs/path/mcp/skos_mcp.py"] }
      }
    }
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


@mcp.tool()
def validate_skos(rdf: str, format: str = "") -> dict:
    """Validate a SKOS vocabulary, qSKOS-style.

    Runs the SKOS integrity SHACL shapes (one prefLabel per language [S14],
    prefLabel/altLabel/hiddenLabel disjointness [S13], related-vs-broader
    disjointness [S27], concept/scheme/collection disjointness, typed unique
    notations) plus structural checks (cyclic hierarchy, orphan concepts) and a
    documentation-coverage profile.

    Args:
        rdf: the vocabulary as text (Turtle, RDF/XML, JSON-LD or N-Triples).
        format: optional hint — turtle | xml | json-ld | nt (auto-detected if blank).
    Returns: a JSON report with shacl_conforms, structural_findings, profile, summary.
    """
    return skoslib.validate_rdf(rdf, format or None)


@mcp.tool()
def convert_skos(rdf: str, to: str, from_format: str = "") -> str:
    """Convert a SKOS/RDF document to another serialization.

    Args:
        rdf: the source document as text.
        to: target format — turtle | rdf/xml | json-ld | n-triples | rdf/json.
        from_format: optional source hint (auto-detected if blank).
    Returns: the converted document as text.
    """
    text, _mime, _ext = skoslib.convert_rdf(rdf, to, from_format or None)
    return text


@mcp.tool()
def skos_profile(rdf: str, format: str = "") -> dict:
    """Profile a SKOS vocabulary before trusting it as grounding context.

    Reports concept count, documentation coverage, number of top concepts, and
    structural findings (cycles, orphans) — a quick read on whether a vocabulary
    is sound enough to ground an answer on.

    Args:
        rdf: the vocabulary as text.
        format: optional format hint (auto-detected if blank).
    """
    g = skoslib.parse_rdf(rdf, format or None)
    findings, profile = skoslib.structural_findings(g)
    return {"profile": profile, "findings": findings, "triples": len(g)}


if __name__ == "__main__":
    mcp.run()
