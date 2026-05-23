# Mostek raportu operatora → Google Workspace

**Status:** operacyjny add-on Project B (nie zastępuje lokalnego MCP `epir-gworkspace`).

## Przepływ

1. Cron `0 9 * * *` UTC na `epir-bigquery-batch` buduje raport Markdown (`operator-daily-report.ts`).
2. Raport trafia do D1 `operator_daily_reports` (baza `ai-assistant-sessions-db`).
3. Opcjonalnie: `POST` na `GWORKSPACE_REPORT_WEBHOOK_URL` (secret na batch workerze).

## Konfiguracja webhook (Apps Script)

1. Utwórz projekt Apps Script powiązany z Dyskiem operatora.
2. Funkcja `doPost(e)` przyjmuje JSON `{ title, body }` i tworzy plik Google Doc lub zapis `.md` na Drive.
3. Wdróż jako **Web app** (wykonaj jako Ty, dostęp: tylko Ty).
4. `wrangler secret put GWORKSPACE_REPORT_WEBHOOK_URL` w `workers/bigquery-batch`.

**Orthodoksja:** webhook to osobny kanał zaufania; nie zastępuje `EPIR_CHAT_SHARED_SECRET` ani Storefront MCP.

## Odczyt w Operator Studio

`GET /internal/solo-dev-chat/api/operator-report/latest` (Bearer `X-Admin-Key`).

Lokalny odczyt briefów nadal przez MCP `epir-gworkspace` w Cursorze (`gdocs_read_markdown` po `fileId`).
