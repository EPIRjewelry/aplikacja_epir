# EPIR commerce smoke — epirbizuteria.pl + zareczyny

Checklist po deployu `workers/chat`, TAE i Hydrogen (zareczyny). Smoke = happy-path „dodaj do koszyka” + opcjonalnie Sign in with Shop.

## Deploy (kolejność)

1. `cd workers/chat && npx wrangler deploy`
2. `npm run shopify:app:deploy` (TAE — wymaga `shopify auth login`)
3. Zareczyny Pages:
   ```powershell
   cd apps/zareczyny
   npm run build
   ..\..\node_modules\.bin\wrangler pages deploy public --project-name=zareczyny-hydrogen-pages --branch=main
   ```

## epirbizuteria.pl (TAE)

1. Zgoda na czat w panelu Gemmy.
2. (Opcjonalnie) **Sign in with Shop** — przycisk w nagłówku czatu → zaloguj → zapytaj o status ostatniego zamówienia.
3. Wiadomość: produkt **jednowariantowy** lub znany rozmiar (np. „Dodaj pierścionek Gałązki rozmiar 12 do koszyka”).
4. DevTools → Network → stream `/apps/assistant/chat`:
   - `event: commerce_action` z `checkout_url` lub `cart_id`
5. Przycisk checkout z czatu otwiera checkout z właściwą pozycją.
6. (Opcjonalnie) po `commerce_action` — event `shopify:cart:lines-update` w konsoli (standard storefront events).

## zareczyny.epirbizuteria.pl (Hydrogen)

1. Zgoda na czat.
2. Sign in with Shop (przycisk nad widgetem czatu).
3. Ta sama wiadomość co wyżej.
4. Network → `/api/chat` (SSE): `commerce_action`.
5. Drawer / badge koszyka aktualizuje się bez pełnego reload.
6. Checkout z `checkout_url` — ta sama kwota i produkt.

## Catalog API (UCP discovery)

Worker routuje `catalog_search` / `catalog_lookup` / `catalog_image_search` na `{shop}/api/ucp/mcp`. Smoke po stronie operatora:

- Zapytanie z obrazem w czacie (multimodal) → narzędzie `catalog_image_search` w logach workera.
- Profil agenta: `GET https://asystent.epirbizuteria.pl/.well-known/ucp-agent-profile.json`

## PASS / FAIL

| PASS | FAIL |
|------|------|
| MCP `update_cart` sukces | Model prosi o ręczne `cart_id` |
| SSE `commerce_action` | Brak eventu mimo sukcesu MCP |
| Checkout działa | Pusty `checkout_url` |
| Hydrogen: drawer sync | `SYNC_CART_ID` nie aktualizuje sesji |
| Zalogowany: `get_most_recent_order_status` | Brak tokenu / 401 na order status |

Przy FAIL: Cloudflare Observability na `epir-art-jewellery-worker` (tagi `chat.mcp`, `streamAssistant`).

## Powiązane

- [EPIR_AGENTIC_CHANNELS_RUNBOOK.md](./EPIR_AGENTIC_CHANNELS_RUNBOOK.md) — kanały zewnętrzne (Faza 4)
- [EPIR_SIDEKICK_OPERATOR_STUDIO_MAP.md](./EPIR_SIDEKICK_OPERATOR_STUDIO_MAP.md) — Faza 5
