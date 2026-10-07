# Gemma przebudowa — etap 1 z 6 (fundament)

**SSOT planu:** `plan-agent-ekspert-gemma-2026-10-07.md` (Downloads / docs/working po mirrorze).  
**Zakres PR:** tylko `workers/chat`. **Bez deploy** z Cursora. Kanały kupującego domyślnie **OFF** (wyłącznik fail-closed).

## §0 — Audyt `/api/mcp` (legacy Storefront MCP)

Shopify usunął z `https://{shop}/api/mcp` narzędzia katalogu i koszyka; działa `search_shop_policies_and_faqs`.  
W tym repo wołania legacy `/api/mcp` (poza politykami) usuwamy lub blokujemy w etapie 1. Katalog kupującego: UCP `/api/ucp/mcp` (`mcp_server.ts`).

## §1 — Decyzje operatora (wpisane)

- Forma: **Pan/Pani** (brak „ty”).
- EPIR: darmowa wysyłka od **500 zł za całe zamówienie** (srebro; złoto — tylko gdy fakt na karcie).
- **14 dni** odstąpienia dla produktu standardowego; custom — cytat regulaminu (etap 2: `StorePolicyFacts`).
- Token Storefront KAZKA: ustawia operator; Cursor **nie** dodaje sekretów.

## §2 — Martwy kod

- `shopify-mcp-client.ts`: tylko `search_shop_policies_and_faqs` na `/api/mcp`.
- Usunąć eksporty wołające `get_order_status`, `get_most_recent_order_status`, `search_catalog`, `get_shop_policies`, `update_cart`, `get_cart` przez legacy endpoint.
- Z schematów narzędzi kupującego: `get_order_status`, `get_most_recent_order_status`.
- `rag.ts`: nie wołać martwych narzędzi koszyka/zamówienia na `/api/mcp`.

## §3 — Wyłącznik i fakty

### §3.1 Niedostępność

Gdy kanał `off`: odpowiedź `{"type":"unavailable"}` (bez formy „ty”; neutralnie lub Pan/Pani w copy UI później).  
Tryb `internal`: tylko z nagłówkiem wewnętrznym (`EPIR_INTERNAL_KEY`). Domyślnie **fail-closed**.

### §3.2 Wyłącznik KV

Klucz: `gemma:channel:<channel>` → `off` | `internal` | `on`.  
Fallback: zmienne `GEMMA_CHANNEL_<channel>` / `GEMMA_CHANNEL_DEFAULT` w `[vars]`.

### §3.3 Warstwa `src/facts/`

`ProductFacts` / `VariantFacts`: pochodzenie, metal, cena wariantu, **image**, **collections** — normalizacja z węzła Admin/Storefront/UCP. Testy normalizacji.

## §4 — Eval / live

Etap 1 nie zmienia bramki live-eval (etap 3). Po merge: kanały OFF → brak regresji u kupującego.

## §5 — Shopify / sekrety

Bez nowych sekretów. Bez zmian copy polityk w etapie 1 (fakty sklepu w etapie 2).

## §6 — Zakazy

Bez deploy, bez mutacji Ads/Shopify Admin copy, bez hardkodów SKU w promptach.

## §7 — Porzucona paczka

Nazwa archiwum eksperymentu: **`pr148-paczka.zip`** — to nie jest PR #148 (raport operatora) w GitHubie.
