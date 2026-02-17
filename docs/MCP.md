# TextEx MCP Server

The MCP server exposes TextEx's LaTeX compilation as tools for AI assistants (Claude Desktop, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io/).

## Build & Run

```bash
# Build the MCP server
npm run build:mcp

# Start the MCP server (stdio transport)
npm run mcp
```

## Tools Provided

| Tool | Description |
|------|-------------|
| `compile_latex` | Compile a `.tex` file. Input: `{ file_path: string }`. Returns `{ success, pdfPath }` or `{ success: false, error }`. |
| `get_compile_log` | Returns stdout/stderr from the last compilation for diagnosing errors. |
| `list_papers` | List LaTeX documents in a directory. Returns metadata for found papers. |
| `get_paper_info` | Get full metadata and section outline of a LaTeX document. |
| `get_outline` | Get the section outline tree of a document. |
| `get_section` | Read the LaTeX content of a specific section by its title path. |
| `update_section` | Replace the body content of a specific section while preserving structure. |

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "textex": {
      "command": "node",
      "args": ["/absolute/path/to/textex/out/mcp/mcp/server.js"]
    }
  }
}
```

### Other Clients

Any client supporting stdio transport can connect by running `node out/mcp/mcp/server.js` from the project root.
