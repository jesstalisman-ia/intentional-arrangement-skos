# MCP server

Exposes the SKOS engine (`../api/skoslib.py`) as Model Context Protocol tools, so an assistant can *ground* on your vocabulary work.

```bash
pip install -r requirements.txt
python skos_mcp.py           # stdio transport
```

Register with an MCP client (Claude Desktop / Claude Code):
```json
{ "mcpServers": { "skos": { "command": "python", "args": ["/abs/path/mcp-server/skos_mcp.py"] } } }
```

## Tools
- **`validate_skos(rdf, format="")`** — qSKOS-style validation (SHACL integrity S13/S14/S27 + structural cycles/orphans + coverage).
- **`convert_skos(rdf, to, from_format="")`** — convert between turtle | rdf/xml | json-ld | n-triples | rdf/json.
- **`skos_profile(rdf, format="")`** — quick soundness read before trusting a vocabulary as grounding.

Works with the `mcp` SDK 2.x (`MCPServer`) and 1.x (`FastMCP`) via a compatibility shim.
