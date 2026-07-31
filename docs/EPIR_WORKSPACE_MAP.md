# EPIR — mapa workspace (wiele repo, jeden kanon)

**Kanon dokumentacji i backendu:** wyłącznie [`aplikacja_epir`](https://github.com/EPIRjewelry/aplikacja_epir) (ten monorepo).

## Repozytoria / katalogi

| Ścieżka lokalna (przykład) | Rola | Deploy / runtime |
|----------------------------|------|------------------|
| `aplikacja_epir/` | Shopify app, Workers, docs, MCP lokalne (`mcp-servers/`), motyw `themes/epir-online-store` | Produkcja CF + Shopify |
| `epir_analityc/` lub `epir-marketing-agent-service/` | Project B sidecar (Agents SDK), marketing preview | Worker `epir_analityc` |
| `Blender Assets/Blender_assist/` (osobne repo u operatora) | CAD, packshot, Blender MCP, most Operator Studio | Tylko IDE + Blender — **jedyny klon**; nie `D:\Blender_Assist` |

**Nie** utrzymuj drugiego zestawu dokumentów wiążących w repo Blender ani `epir_analityc` — linkuj do kanonu w `aplikacja_epir`.

## Cursor — jeden plik workspace

Szablon: [`epir.code-workspace`](../epir.code-workspace) w rootie tego repo — zakłada sąsiednie katalogi `../epir_analityc` i `../Blender Assets/Blender_assist`.

Jeśli repo leżą gdzie indziej, skopiuj plik `.code-workspace` do katalogu nadrzędnego i popraw `folders[].path`.

## MCP (IDE — lokal + Cloud)

**Shopify (kanonicznie, lokalnie):** plugin AI Toolkit — `/add-plugin shopify` lub [Cursor Marketplace](https://cursor.com/marketplace/shopify). **Bez zainstalowanego pluginu** `shopify-dev-mcp` i operacje admin w IDE nie działają — zainstaluj Toolkit przed pracą ze sklepem z Cursora. Plugin dostarcza `shopify-dev-mcp` i `shopify-admin-mcp` (user-level, auto-update). **Nie** duplikuj ich w `mcp.json`. Onboarding: [`.cursor/SHOPIFY_MCP_SETUP.txt`](../.cursor/SHOPIFY_MCP_SETUP.txt) (sekcja 0 — kroki operatora).

**EPIR (repo):** skopiuj [`.cursor/mcp-epir.example.json`](../.cursor/mcp-epir.example.json) → `.cursor/mcp.json` w workspace root (tylko serwery EPIR).

| Serwer | Źródło | Zakres |
|--------|--------|--------|
| `shopify-dev-mcp` | Shopify plugin | Docs, walidacja GraphQL/Liquid |
| `shopify-admin-mcp` | Shopify plugin | Operacje admin w sklepie (CLI) |
| `epir-data-ops` | `mcp.json` repo | EDOG, D1 read, flow-health |
| `epir-gworkspace` | `mcp.json` repo | Docs/Sheets po fileId |
| `user-blender-mcp` | Blender (poza repo) | CAD / packshot |
| Cloudflare plugin MCP | plugin Cursor | docs, bindings, observability |

**Gemma (runtime produkcyjny):** `workers/chat` → Storefront MCP (`MCP_ENDPOINT` w `workers/chat/wrangler.toml`) — **osobna ścieżka**, nie konfiguruj w Cursor `mcp.json`.

Szczegóły deploy: [`EPIR_DEPLOYMENT_AND_OPERATIONS.md`](EPIR_DEPLOYMENT_AND_OPERATIONS.md).

## Przepływ danych (skrót)

[`EPIR_DATA_FLOW_MAP.md`](EPIR_DATA_FLOW_MAP.md) — pixel, batch, Iceberg, kanał `operator`, granica do `epir_analityc`.
