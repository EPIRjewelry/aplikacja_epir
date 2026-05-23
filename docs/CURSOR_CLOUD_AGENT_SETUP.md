# Cursor Cloud Agent — EPIR (bez Cursor SDK)

**Cel:** agent w chmurze z tym samym zestawem MCP co lokalnie (audyt EDOG, GWorkspace, Shopify Admin read-only).

To **nie** jest `@cursor/sdk` — konfigurujesz środowisko Cloud w panelu Cursor.

## 1. Repo

Podłącz `EPIRjewelry/aplikacja_epir` (gałąź `main`).

## 2. MCP (`mcp.json`)

Skopiuj treść z [`.cursor/mcp-epir.example.json`](../.cursor/mcp-epir.example.json) do ustawień MCP środowiska Cloud.

Ustaw **secrets / env** w UI Cursor (nie commituj):

| Zmienna | Użycie |
|---------|--------|
| `CLOUDFLARE_ACCOUNT_ID` | `epir-data-ops` |
| `CLOUDFLARE_API_TOKEN` | D1 Read |
| `EPIR_BATCH_WORKER_ORIGIN` | flow-health |
| `DATA_GUARDIAN_OPS_KEY` | Bearer EDOG |
| `GWORKSPACE_OAUTH_*` | `epir-gworkspace` |

Dodatkowo włącz w Cursor (jeśli dostępne): **Shopify Admin MCP**, **Cloudflare** plugin MCP, **Blender MCP** — jak lokalnie.

## 3. Reguły i skille

Repo zawiera [`.cursor/rules/`](../.cursor/rules/) i [`.cursor/skills/`](../.cursor/skills/).

Przykładowe zadania dla Cloud Agent:

- „Uruchom audyt EDOG: `flow_health_summary`, werdykt PASS/FAIL”
- „Recenzja PR: ESOG + EDCG na zmianach w `workers/bigquery-batch`”
- „Przeczytaj brief z Docs” — `gdocs_read_markdown` po `fileId`

**Deploy produkcyjny:** używaj skillu `epir-deployment`; nie deployuj z Cloud bez review.

## 4. Granice

- Cloud Agent **nie** zastępuje Operator Studio (`/internal/operator-studio`) do codziennych raportów liczbowych.
- Cloud Agent **nie** ma dostępu do sekretów Shopify w workerze — tylko to, co skonfigurujesz w MCP env.

## 5. Koszt

- MCP `epir-data-ops` woła produkcję na żądanie (D1 API + flow-health).
- Cron na CF (EDOG 2×/dobę, raport 09:00 UTC) działa **bez** Cursor Cloud.
