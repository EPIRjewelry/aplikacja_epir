# epir-inpost-marketplace

Cloudflare Worker for Von Halsky marketplace (INPSA): stage Client Credentials, order-event poll, idempotent Shopify `orderCreate` with tag/source `inpost-vh` (ADR 0002 UC v1).

Binding decision and sequence: [`docs/adr/0002-inpost-marketplace-orders.md`](../../docs/adr/0002-inpost-marketplace-orders.md).

## Boundary with ShipX

`workers/inpost` (`epir-inpost-proxy`) remains the ShipX pickup-points proxy (`INPOST_*`, `easypack24.net`, scope `openid api:apipoints`). This worker uses **`INPSA_*` only** — never reuse `INPOST_CLIENT_ID`, `INPOST_ENV`, or `INPOST_POINTS_CACHE`.

Fulfillment (ShipX shipment with `delivery.email`) is a later handoff. This worker does not create labels or ShipX shipments.

## Deploy posture (honest)

| Item | Status |
|------|--------|
| `package.json` + `src/` + `wrangler.toml` | Present — unit tests and local `wrangler dev` |
| `.github/workflows/deploy.yml` | **Not** included (same as `workers/inpost`) |
| `wrangler deploy` / prod INPSA | Requires explicit operator approval |
| Cloudflare secrets / real D1 id | **Not** created by this repo change |

`wrangler.toml` sets `INPSA_ENV = "stage"` by default. D1 binding uses a **placeholder** `database_id` until operator creates the database.

## Secrets and vars (names only)

| Name | Kind | Role |
|------|------|------|
| `INPSA_CLIENT_ID` | secret | OAuth Client Credentials |
| `INPSA_CLIENT_SECRET` | secret | OAuth Client Credentials |
| `INPSA_ENV` | var | `stage` (default) or `production` after operator OK |
| `INPSA_ORGANIZATION_ID` | var (plain) | Portal path param for `/v1/organizations/{organizationId}/…` |
| `EPIR_OPERATOR_PANEL_SECRET` | optional secret | Bearer for `/ops/inpsa-*` |
| `SHOPIFY_ADMIN_TOKEN` | secret | Admin API of app `epir_ai` (same name as chat) |
| `SHOP_DOMAIN` | var | e.g. `epir-art-silver-jewellery.myshopify.com` |
| `INPSA_ORDERS_DB` | D1 binding | Poll cursor + idempotency (`inpsa-order:{id}`) |

## Local dev

```bash
# from repo root
npm install --legacy-peer-deps --no-audit --no-fund
npm run test -w epir-inpost-marketplace
cd workers/inpost-marketplace && npx wrangler dev
```

Use `.dev.vars` (gitignored) for local secrets — **do not commit values**.

Schema file (apply only after operator D1 create): [`migrations/0001_inpsa_orders.sql`](migrations/0001_inpsa_orders.sql).

## HTTP surface

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | none | Liveness |
| `GET /` | none | Worker metadata |
| `GET /ops/inpsa-smoke` | Bearer | Stage CC + events poll (limit 1) |
| `POST /ops/inpsa-orders-events-poll?dryRun=1` | Bearer | Poll → map → **plan** (default; no Shopify write, no D1 mutate) |
| `POST /ops/inpsa-orders-events-poll?dryRun=0` | Bearer | Live `orderCreate` + persist idempotency (operator only) |

Optional query: `untilId` (OpenAPI events pagination), `limit`.

## Implementation status

1. **Done:** Client Credentials, events poll (`untilId`), order detail fetch, D1 schema file, mapper, Shopify Admin `orderCreate`, dry-run default.
2. **Operator later:** secrets, real D1 id, first stage smoke, then careful `dryRun=0`.
3. **Later:** offers sync, cron, CI deploy list, ShipX fulfillment handoff.

Portal API: [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/) (`gokart-api.html`).
