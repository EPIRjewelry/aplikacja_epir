# EPIR — mapa workspace (wiele repo, jeden kanon)

**Kanon dokumentacji i backendu:** wyłącznie [`aplikacja_epir`](https://github.com/EPIRjewelry/aplikacja_epir) (ten monorepo).

## Repozytoria / katalogi

| Ścieżka lokalna (przykład) | Rola | Deploy / runtime |
|----------------------------|------|------------------|
| `aplikacja_epir/` | Shopify app, Workers, docs, MCP lokalne (`mcp-servers/`) | Produkcja CF + Shopify |
| `epir_analityc/` lub `epir-marketing-agent-service/` | Project B sidecar (Agents SDK), marketing preview | Worker `epir_analityc` |
| `Blender Assets/Blender_assist/` (osobne repo u operatora) | CAD, packshot, Blender MCP, most Operator Studio | Tylko IDE + Blender — **jedyny klon**; nie `D:\Blender_Assist` |

**Nie** utrzymuj drugiego zestawu dokumentów wiążących w repo Blender ani `epir_analityc` — linkuj do kanonu w `aplikacja_epir`.

## Cursor — jeden plik workspace

Szablon: [`epir.code-workspace`](../epir.code-workspace) w rootie tego repo — zakłada sąsiednie katalogi `../epir_analityc` i `../Blender Assets/Blender_assist`.

Jeśli repo leżą gdzie indziej, skopiuj plik `.code-workspace` do katalogu nadrzędnego i popraw `folders[].path`.

## MCP (IDE — lokal + Cloud)

Skopiuj [`.cursor/mcp-epir.example.json`](../.cursor/mcp-epir.example.json) → `.cursor/mcp.json` w **każdym** repo lub w workspace root (jeden plik dla całego workspace).

| Serwer | Zakres |
|--------|--------|
| `epir-data-ops` | EDOG, D1 read, flow-health |
| `epir-gworkspace` | Docs/Sheets po fileId |
| `user-shopify-admin-mcp` | Admin (poza repo) |
| `user-blender-mcp` | Blender (poza repo) |
| Cloudflare plugin MCP | docs, bindings, observability |

Szczegóły deploy: [`EPIR_DEPLOYMENT_AND_OPERATIONS.md`](EPIR_DEPLOYMENT_AND_OPERATIONS.md).

## Przepływ danych (skrót)

[`EPIR_DATA_FLOW_MAP.md`](EPIR_DATA_FLOW_MAP.md) — pixel, batch, Iceberg, kanał `operator`, granica do `epir_analityc`.
