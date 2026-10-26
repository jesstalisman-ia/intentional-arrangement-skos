# MCP server

Exposes the SKOS engine (`../api/skoslib.py`) as Model Context Protocol tools, so an assistant can *ground* on your vocabulary work.

```bash
pip install -r requirements.txt
python skos_mcp.py           # stdio transport
```

Register with an MCP client (Claude Desktop / Claude Code):
```json
{ "mcpServers": { "skos": { "command": "python", "args": ["/abs/path/mcp-server/skos_mcp.py"], "env": { "IA_SKOS_FILES": "/abs/path/to/your/vocabularies" } } } }
```

## Tools
- **`validate_skos(rdf="", format="", detail="summary", file_path="")`** — qSKOS-style validation: the SHACL integrity shapes (S13/S14/S27 and the rest of the catalogue, including label conflicts, whitespace and one-way `skos:related`) plus structural cycles/orphans and coverage. Returns the SHACL results as structured data; `detail="summary"` (the default) groups them by shape and severity with each message once, `detail="full"` lists every result and adds pySHACL's text report. `summary.violations` and `summary.warnings` count SHACL and structural findings together; `summary.no_violations` is the flag to gate on, since `shacl_conforms` is false whenever any result exists, info included.
- **`convert_skos(rdf="", to="turtle", from_format="", file_path="", out_path="")`** — convert between turtle | rdf/xml | json-ld | n-triples | rdf/json. With `out_path` the result is written to a file and only a confirmation comes back.
- **`skos_profile(rdf="", format="", file_path="")`** — the profile: counts, coverage, structural findings, SHACL counts by severity, and `sound` (true only when nothing is at violation level).

**Large vocabularies.** `rdf` as text is practical up to a few hundred kilobytes; beyond that a tool call is too large for a model. Set the `IA_SKOS_FILES` environment variable to the directory (or directories, separated by the OS path separator) that holds your vocabularies and pass `file_path` instead. Paths outside those directories are refused, and `out_path` is held to the same directories.

Works with the `mcp` SDK 2.x (`MCPServer`) and 1.x (`FastMCP`) via a compatibility shim.
