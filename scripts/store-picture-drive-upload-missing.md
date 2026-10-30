# Drive — brakujące / do podmiany (MCP)

Folder: `1OgrBRC6D_0KYUWNAXU7LOxhFD9jUOmuv`  
https://drive.google.com/drive/folders/1OgrBRC6D_0KYUWNAXU7LOxhFD9jUOmuv

## Brakuje lub wymaga pełnej treści

| Plik | Lokalnie (pełny) | MCP payload |
|------|------------------|-------------|
| `ga4-landing` (arkusz) | `tmp/store-picture-csv/ga4-landing.csv` | `agent-tools/mcp-create-landing.json` |
| `ads-conversion-snapshot.json` | `tmp/store-picture-csv/ads-conversion-snapshot.json` | `agent-tools/mcp-create-conv.json` |

W Cursorze: `create_file` z argumentami = zawartość pliku `mcp-create-*.json` (jedna linia JSON).

## Pipeline (odświeżenie)

```bash
node scripts/store-picture-fetch.mjs
node scripts/store-picture-to-csv-bundle.mjs
node scripts/store-picture-build-drive-payload.mjs 1OgrBRC6D_0KYUWNAXU7LOxhFD9jUOmuv
node scripts/store-picture-split-drive-payload.mjs
```

Upload: Google Drive MCP `create_file` per `tmp/drive-items/NN.json` lub `store-picture-emit-drive-payload.mjs`.
