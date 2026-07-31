# EPIR agentic channels — operator runbook (Faza 4)

Włączenie syndykacji **Shopify Catalog** do kanałów zewnętrznych (Microsoft Copilot, Meta, Shop app). Brak zmian w `workers/chat` — Gemma na własnych storefrontach działa niezależnie.

## Wymagania wstępne

- Sklep na planie z dostępem do **Catalog syndication** (Spring ’26 / Agentic).
- Produkty opublikowane na kanale Online Store.
- Smoke na `epirbizuteria.pl` + `zareczyny` zakończony (Faza 0).

## Kroki w Shopify Admin

1. **Settings → Apps and sales channels → Develop apps** — aplikacja `epir_ai` zainstalowana.
2. **Sales channels** — włącz kanały AI / Catalog syndication (nazwa w UI zależy od edycji):
   - **Shop app / Shop Catalog**
   - **Microsoft Copilot** (UCP checkout poza sklepem)
   - **Meta** (gdy dostępne w regionie)
3. **Products** — upewnij się, że listingi mają zdjęcia, ceny PLN i warianty zgodne z MCP.
4. **Analytics** — po 24–48 h sprawdź:
   - Orders → filter by sales channel / attribution
   - Shopify Analytics → sessions by channel (jeśli widoczne)

## Monitoring w pipeline EPIR

| Źródło | Co śledzić |
|--------|------------|
| Shopify Admin Analytics | Zamówienia z kanałów AI |
| `extensions/my-web-pixel` | Konwersje `commerce_action` na własnych storefrontach |
| BigQuery / warehouse | `storefrontId`, `channel` w kontrakcie EDCG |

Taguj wewnętrznie kanały zewnętrzne jako `channel: external-ai` tylko w raportach admina — **nie** mieszaj z `epir-liquid` / `zareczyny-hydrogen` w dashboardach Gemmy.

## Troubleshooting

| Objaw | Działanie |
|-------|-----------|
| Produkty niewidoczne w Copilot | Sprawdź publikację katalogu i politykę Markets |
| Checkout w Copilot fail | UCP po stronie Shopify — nie debuguj w workerze czatu |
| Brak atrybucji w Analytics | Odczekaj okno agregacji; zweryfikuj włączoną syndykację |

## Powiązane dokumenty

- [EPIR_COMMERCE_SMOKE_CHECKLIST.md](./EPIR_COMMERCE_SMOKE_CHECKLIST.md)
- [EPIR_ANALYTICS_DATA_CONTRACT.md](./EPIR_ANALYTICS_DATA_CONTRACT.md)
