# @epir/mcp-gworkspace

Lokalny serwer MCP (stdio) dla **Google Drive / Docs / Sheets** — tylko IDE (Cursor), nie worker produkcyjny.

- Uruchamiany **wyłącznie w Cursorze** (jak Blender MCP), nie w workerze produkcyjnym.
- OAuth refresh token w **OS keychain** (`keytar`) lub `GWORKSPACE_REFRESH_TOKEN` (dev).
- **Docs → Markdown**, **Sheets → CSV** przed przekazaniem do modelu (mniej tokenów niż HTML/XML).

## Instalacja

Z katalogu głównego repo:

```bash
npm install --legacy-peer-deps --no-audit --no-fund
npm run build -w @epir/mcp-gworkspace
```

## OAuth (jednorazowo)

1. Utwórz OAuth Client (Desktop lub Web) w [Google Cloud Console](https://console.cloud.google.com/).
2. Ustaw zmienne (nie commituj):

   - `GWORKSPACE_OAUTH_CLIENT_ID`
   - `GWORKSPACE_OAUTH_CLIENT_SECRET`
   - opcjonalnie `GWORKSPACE_OAUTH_REDIRECT_URI` (domyślnie `http://127.0.0.1:43210/oauth2callback`)

3. Autoryzacja:

```bash
npm run auth -w @epir/mcp-gworkspace
```

## Cursor — `mcp.json`

Skopiuj fragment z [`.cursor/mcp-gworkspace.example.json`](../../.cursor/mcp-gworkspace.example.json) do `.cursor/mcp.json` (lub ustawień użytkownika).

## Narzędzia MCP

| Narzędzie | Opis |
|-----------|------|
| `gworkspace_auth_status` | Status OAuth (bez sekretów) |
| `gworkspace_auth_url` | URL do logowania |
| `gworkspace_auth_exchange_code` | Wymiana kodu na refresh token |
| `gdrive_get_metadata` | Metadane pliku po `fileId` |
| `gdocs_read_markdown` | Docs → Markdown (+ sliding window) |
| `gsheets_read_csv` | Sheets → CSV |
| `gdrive_export_text` | Zapis artefaktu tekstowego na Drive |

## Project B

Odczyt briefu: **Cursor** (MCP `epir-gworkspace`). W Operator Studio wklej Markdown/CSV w roli `creative` — worker nie ma tokenów Google.

## Testy

```bash
npm run test -w @epir/mcp-gworkspace
```
