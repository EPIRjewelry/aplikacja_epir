# specs/ — twarde dane poza indeksem Cursor

Katalog roboczy dla surowych struktur, schematów Pipelines i logów audytowych. Cały `specs/` jest w [`.cursorignore`](../.cursorignore) — w Cursorze używaj jawnego `@file` na konkretny plik.

| Ścieżka | Zawartość |
|---------|-----------|
| `schemas/` | JSON schematy streamów Pipelines (`pixel-events-stream`, `messages-stream`) |
| `logs/` | Artefakty jobów / zapytań (np. `bigquery_job.json`) |

Operacyjny README Wranglera i SQL pipeline: [`workers/bigquery-batch/pipelines-schemas/README.md`](../workers/bigquery-batch/pipelines-schemas/README.md).
