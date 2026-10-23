/** Błąd MCP search_catalog — tylko ścieżka Gemma v2 (nie legacy buyer). */
export class CatalogMcpSearchError extends Error {
  readonly mcpCode: number;

  constructor(mcpCode: number) {
    super('catalog_mcp_search_error');
    this.name = 'CatalogMcpSearchError';
    this.mcpCode = mcpCode;
  }
}
