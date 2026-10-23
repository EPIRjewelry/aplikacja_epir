# epir-inpost-marketplace

Szkielet workera Cloudflare dla marketplace Von Halsky (INPSA): oferty i zamówienia.

Decyzja, hosty, scope’y, przepływ UC v1 i propozycja nazw sekretów: [`docs/adr/0002-inpost-marketplace-orders.md`](../../docs/adr/0002-inpost-marketplace-orders.md).

## Granica ze ShipX

`workers/inpost` (`epir-inpost-proxy`) zostaje lookupiem punktów ShipX: bindingi `INPOST_*`, hosty `easypack24.net`, scope `openid api:apipoints`. Ten katalog go nie zastępuje.

Fulfillment (przesyłka ShipX z `delivery.email`) jest późniejszym handoffem. API marketplace przesyłki nie tworzy. Ten szkielet etykiet nie zawiera.

## Stan katalogu

Brak kodu uruchamialnego, brak `package.json`, brak `wrangler.toml`.

Root `package.json` ma workspace `workers/*`. Katalog bez `package.json` nie staje się paczką npm. Sąsiednie pliki `wrangler.toml` (lustro: `workers/inpost/wrangler.toml`) ustawiają `main`, bindingi i identyfikatory zasobów — szkielet bez `src/index.ts` byłby fałszywym celem `wrangler deploy`. Deploy dopisujemy razem z implementacją, po zgodzie operatora.

Sekrety Cloudflare nie są zakładane. Propozycja nazw (`INPSA_CLIENT_ID`, `INPSA_CLIENT_SECRET`, zmienna `INPSA_ENV`) jest wyłącznie w ADR i jest rozłączna z `INPOST_*`.

## Kolejność

1. Client Credentials na stage (`stage-account.inpost-group.com` → `stage-api.inpost-group.com/inpsa/`).
2. UC zamówień: poll `GET …/orders/events` → zamówienie Shopify ze źródłem i tagiem `inpost-vh`.
3. Synchronizacja ofert — później.

Portal API: [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/).
