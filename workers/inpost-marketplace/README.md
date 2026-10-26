# epir-inpost-marketplace

Cloudflare Worker for Von Halsky marketplace (INPSA): stage Client Credentials, order-event poll skeleton, and Shopify `inpost-vh` mapping stub.

Binding decision and sequence: [`docs/adr/0002-inpost-marketplace-orders.md`](../../docs/adr/0002-inpost-marketplace-orders.md).

## Boundary with ShipX

`workers/inpost` (`epir-inpost-proxy`) remains the ShipX pickup-points proxy (`INPOST_*`, `easypack24.net`, scope `openid api:apipoints`). This worker uses **`INPSA_*` only** — never reuse `INPOST_CLIENT_ID`, `INPOST_ENV`, or `INPOST_POINTS_CACHE`.

Fulfillment (ShipX shipment with `delivery.email`) is a later handoff. This worker does not create labels or ShipX shipments.

## Deploy posture (honest)

| Item | Status |
|------|--------|
| `package.json` + `src/` | Present — unit tests and local `wrangler dev` |
| `.github/workflows/deploy.yml` | **Not** included (same as `workers/inpost`) |
| `wrangler deploy` / prod INPSA | Requires explicit operator approval |
| Cloudflare secrets | **Not** created by this repo change |

`wrangler.toml` sets `INPSA_ENV = "stage"` by default. No KV/D1/cron bindings until UC v1 persistence is designed.

## Secrets and vars (names only)

| Name | Kind | Role |
|------|------|------|
| `INPSA_CLIENT_ID` | secret | OAuth Client Credentials |
| `INPSA_CLIENT_SECRET` | secret | OAuth Client Credentials |
| `INPSA_ENV` | var | `stage` (default) or `production` after operator OK |
| `INPSA_ORGANIZATION_ID` | var (plain) | Portal OpenAPI path param — `GET /v1/organizations/{organizationId}/orders/events` under `…/inpsa/` |
| `EPIR_OPERATOR_PANEL_SECRET` | optional secret | Bearer for `/ops/inpsa-*` (existing operator secret name) |

Shopify Admin API credentials for `epir_ai` order create are **not** defined in ADR 0002 — wire in a follow-up after operator chooses binding/secret name.

## Local dev

```bash
# from repo root
npm install --legacy-peer-deps --no-audit --no-fund
npm run test -w epir-inpost-marketplace
cd workers/inpost-marketplace && npx wrangler dev
```

Use `.dev.vars` (gitignored) for local secrets — copy from your operator vault; **do not commit values**.

## HTTP surface

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | none | Liveness |
| `GET /` | none | Worker metadata |
| `GET /ops/inpsa-smoke` | Bearer `EPIR_OPERATOR_PANEL_SECRET` | Stage CC token + `GET …/v1/organizations/{organizationId}/orders/events` (limit 1; requires `INPSA_ORGANIZATION_ID`) |
| `POST /ops/inpsa-orders-events-poll?dryRun=1` | same | Poll events + Shopify **plan** stub (no Admin API) |

Ops routes return **404** when `EPIR_OPERATOR_PANEL_SECRET` is unset (no accidental public smoke).

## Implementation status

1. **Done in repo:** Client Credentials client (in-memory ~5 min TTL, 30s refresh skew), INPSA API client, mocked tests, ops smoke/poll skeleton.
2. **TODO (operator):** `wrangler secret put INPSA_CLIENT_ID` / `INPSA_CLIENT_SECRET`, first live stage smoke via `/ops/inpsa-smoke`.
3. **TODO (UC v1):** Set `INPSA_ORGANIZATION_ID` from portal, add KV/D1 idempotency, implement Shopify Admin API order create with tag/source `inpost-vh`.
4. **Later:** Offers sync (`api:offers:*`), cron trigger, CI deploy list entry.

Portal API (shape of paths and fields): [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/).
