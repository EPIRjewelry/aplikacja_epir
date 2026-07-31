# Brief Kustosza — 2026-07-21

## EDOG
**FAIL** — `warehouse_pixel_empty` (warstwa: **pipeline/warehouse**). D1 pixel 24h=797, pending=6, `warehouse_pixel_sessions=0`. Q1 OK technicznie, ale lejek sklepu w Iceberg jest pusty.

## Lejek (źródło: Q* — zawodny przy EDOG FAIL)
- **Q2 / Q5:** 0 wierszy — Iceberg pixel bez użytecznych danych.
- **Q7:** `product_view_sessions=0`, `purchase_sessions=0`.
- **Q1:** `sessions_with_chat=397`, `total_pixel_sessions=0`, `sessions_without_chat=0` (brak underflow po deployu).
- **Nie interpretować** Q2/Q5/Q7 jako „brak konwersji sklepu” — to brak danych w sinku, nie brak ruchu (D1 żywy).

## Czat vs zakup (Q1, Q6)
- Czat żywy: Q6 top sesja 51 wiadomości; 21 sesji w limicie Q6.
- Zakup z pixela w hurtowni: niewidoczny (`total_pixel_sessions=0`).
- D1 messages 24h w flow-health = 0 (Iceberg messages nadal ma historię — Q3/Q6 działają na starszym korpusie).

## Wzorce rozmów Gemmy (Q3, Q9)
Źródło: `Q3_TOP_CHAT_QUESTIONS` / `Q9_TOOL_USAGE` (2026-07-21).
1. Jailbreak/szum: „zniszcz siebie” ×8 (Q3) — prefilter wdrożony; w agregacie Iceberg jeszcze widoczny.
2. **Kontakt** ×3 (Q3) — must-tool policies.
3. **Szafir** ×3; **Kolczyki** ×3; **Gałązki → koszyk** ×3 (Q3).
4. Dostępność produktu („Czarny opal…”) ×3; **Brylant inwestycyjny** ×3.
5. Off-topic / długie wątki (Dawkins) ×3 — nie sprzedaż.
6. **Q9:** tylko fallback `missing_iceberg_name_column` / 34 — brak kolumny `name` w Iceberg messages (nie ma breakdown narzędzi).

## Luki / ryzyka
1. Pipelines pixel: HTTP ingest akceptuje, Iceberg puste — SQL sink (`url AS page_url`) / schema.
2. Messages sink bez `name` → Q9 bezużyteczny biznesowo.
3. Digest dzienny: endpoint reportu 404 (brak excerpt w tej sesji).
4. MCP `epir-data-ops` niezaładowany w IDE — HTTP fallback.

## 3 decyzje biznesowe
1. **Ops CF już:** naprawić Pipelines pixel SQL + dodać `name` do messages sink; catch-up; dopiero potem ufać lejkowi.
2. **Sprzedaż Gemma (już w prod chat):** priorytet Gałązki/koszyk, Kontakt, rozmiar, kamienie — nie konfigurator/grawerunek (brak sygnału w Q3).
3. **Jakość Q3:** jailbreak prefilter + filtr off-topic w kolejnym cyklu Kustosza; ocenić spadek „zniszcz siebie” po tygodniu.

**CURATOR: PASS** (EDOG + Q1/Q2/Q3/Q5/Q6/Q7/Q9 z queryId/flow-health).  
**Lejek biznesowy: FAIL** do naprawy sinku pixel.
