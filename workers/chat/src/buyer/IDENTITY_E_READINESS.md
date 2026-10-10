# Etap E — rozpoznanie read-only (tożsamość / imię / CAA)

Status: **bez implementacji** w kodzie ścieżki kupującego (zgodnie z poleceniem operatora).

## Rozstrzygnięcia planu

- **ADR 0001** (`docs/adr/0001-tae-app-proxy-customer-identity.md`): pewne `shopify_customer_id` tylko z `logged_in_customer_id` po HMAC App Proxy **lub** Session Token JWT (`sub` = `gid://shopify/Customer/...`). `customer_id_hint` w body **nie** ustanawia tożsamości.
- **Imię**: docelowo Customer Account API (`customer_read_customers` w `shopify.app.toml`), **nie** Admin `read_customers`.
- **Pamięć między wizytami**: tylko przy pewnej tożsamości lub zgodzie (`consent_events` / `consent.ts`).

## Co już jest w repo (odczyt kodu)

| Ścieżka | Credential | Użycie dziś |
|--------|------------|-------------|
| TAE / App Proxy | `logged_in_customer_id` + HMAC | `handleChat` (~2814+) — **operator**, nie `handleBuyerTurn` |
| Session Token | `Authorization: Bearer` JWT | `verifyShopifySessionTokenJwt` w `index.ts` (~2840) — operator |
| Admin customer | `getCustomerById` via `shopify-mcp-client` | `handleChat` — **zakaz** przenoszenia na buyer |
| Hydrogen env | `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID` | `apps/kazka`, `apps/zareczyny` — storefront klienta, nie worker czatu |

## Luka do domknięcia przed implementacją E

1. Czy widget / Hydrogen przekazuje do workera **Session Token** czy osobny **Customer Account access token**?
2. Czy buyer `POST /chat` idzie wyłącznie przez App Proxy z `logged_in_customer_id`?
3. Endpoint CAA: odkrycie `/.well-known/customer-account-api` (`mcp_api`) — wymaga decyzji operatora o domenie kont (F zablokowany).

## Rekomendacja następnego PR (po E)

- Wspólny helper `resolveTrustedShopifyCustomerId(request, env)` w `src/buyer/**` (tylko ADR 0001).
- Imię: GraphQL Customer Account API po tokenie przekazanym z frontu — **bez** Admin API.
- Pamięć: `memory_facts` / `person_memory` tylko gdy `resolveTrustedShopifyCustomerId` zwraca GID.
