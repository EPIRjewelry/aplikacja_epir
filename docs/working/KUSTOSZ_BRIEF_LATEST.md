# Brief Kustosza — 2026-07-21 (po fazie A/B/C kodu)

## EDOG
**PASS** (live, przed deployem nowych guardów) — `reasons: ok`; D1 pixel 24h ~791; pending po catch-up: **0** (wyeksportowano 210 wierszy).  
Uwaga: live worker **jeszcze bez** `warehouse_pixel_empty` — po deployu batch EDOG powinien **FAIL**, jeśli Iceberg pixel nadal ma 0 sesji przy żywym D1.

## Lejek (źródło: Q*)
- **Q2 / Q5 / Q8:** puste (`rows=[]`, `bytes_scanned=0`) — Iceberg `epir_pixel_events_raw` praktycznie pusty mimo udanego HTTP ingestu. **Ops:** porównać live Pipelines SQL z `workers/bigquery-batch/pipelines-schemas/pixel-pipeline-production.example.sql` (`url AS page_url`).
- **Q7:** 0 product_view / 0 purchase (pusta tabela pixel).
- **Q1 (live, stary SQL):** `sessions_with_chat=397`, underflow `sessions_without_chat≈2^64` — naprawione w kodzie (clamp + `total_pixel_sessions`); wymaga deployu `epir-bigquery-batch`.

## Czat vs zakup (Q1, Q6)
- Czat żywy; zakup z pixela niewidoczny w hurtowni (brak wierszy Iceberg pixel).

## Wzorce rozmów Gemmy (Q3)
- Intencje sprzedażowe: **Gałązki→koszyk**, Kontakt, Szafir, Kolczyki, Rozmiar 17.
- Szum: „zniszcz siebie” (×8) — prefilter jailbreak w kodzie czatu.
- Brak sygnału konfigurator/grawerunek.

## Luki / ryzyka
1. Pixel Iceberg pusty mimo exportu — pipeline/sink, nie D1.
2. **Q9:** Iceberg `messages_raw` **bez kolumny `name`** (valid: id, session_id, role, content, model, tokens_used, timestamp). Kod: fallback + przykład SQL `messages-pipeline-production.example.sql`.
3. Deploy lokalny zablokowany (token D1 Read only) — deploy przez GH Actions.

## 3 decyzje biznesowe
1. Wdrożyć batch+chat (Q1 clamp, EDOG pixel probe, Gemma playbook) — ten PR.
2. Operator: naprawić Pipelines pixel SQL + dodać `name` do messages sink; potem re-export / catch-up.
3. Gemma: sprzedaż (koszyk Gałązki, Kontakt/rozmiar must-tools, jailbreak redirect, CTA zdjęcia) — bez konfiguratora.

**CURATOR: PASS** (teza = queryId / flow-health / D1 DESCRIBE). Lejek biznesowy **FAIL** do czasu naprawy sinku pixel.
