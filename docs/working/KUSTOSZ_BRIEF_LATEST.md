# Brief Kustosza — 2026-07-21 (po deployu PR #92)

## EDOG
**FAIL** — `warehouse_pixel_empty` (D1 pixel 24h=791, `warehouse_pixel_sessions=0`, pending=0).  
Guard działa zgodnie z fazą A: nie myli żywego czatu z zdrowym lejkiem sklepu.

## Lejek (źródło: Q* po deployu batch)
- **Q1:** `sessions_with_chat=397`, `total_pixel_sessions=0`, `sessions_without_chat=0` — **brak underflow** (PASS kodu).
- **Q2 / Q5:** puste — Iceberg pixel nadal bez użytecznych wierszy mimo catch-up exportu (210 wierszy HTTP ingest, pending=0).
- **Q7:** 0/0 (pusta tabela pixel).
- **Q9:** HTTP 200, wiersz `missing_iceberg_name_column` / `call_count=34` — Iceberg `messages_raw` bez kolumny `name`; fallback aktywny. Przykład SQL: `pipelines-schemas/messages-pipeline-production.example.sql`.

## Czat vs zakup
- Czat OK; zakup/lejek niewidoczny w hurtowni do naprawy Pipelines pixel (`url AS page_url`).

## Wzorce Gemma (Q3 + kod)
- Sprzedaż: Gałązki→koszyk, Kontakt, rozmiar — playbook + must-tools wdrożone (chat deploy ✓).
- Jailbreak „zniszcz siebie” — prefilter (unit PASS); wymaga ręcznego smoke na storefront z TAE.
- CTA zdjęcia: placeholder + aria-label „Znajdź podobne do zdjęcia”.

## Luki / ryzyka
1. **Ops CF (wymaga tokenu Pipelines):** naprawić SQL sink pixel + dodać `name` do messages; potem catch-up / re-export.
2. Deploy GH: batch+chat ✓; `Deploy rag worker` padł w tym samym runie (poza zakresem planu).
3. TAE liquid wymaga `shopify app deploy` osobno (nie w Deploy Cloudflare).

## 3 decyzje
1. Scalić PR #92 po review.
2. Operator: pipeline pixel + messages `name` w Dashboard.
3. Po naprawie sinku — jeden run Kustosza; oczekiwane Q2/Q5 niepuste i EDOG PASS przy `warehouse_pixel_sessions>0`.

**CURATOR: PASS** (Q1/Q9/EDOG z queryId + flow-health po deployu).
