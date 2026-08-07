# `epir-dynamic-landing-liquid`

Cloudflare Worker + HTMLRewriter for the Liquid Online Store (`epirbizuteria.pl`). Reads UTM → `shop.metafields.app.campaign_mapping` → `$app:campaign_landing` metaobject (same data as KAZKA) and mutates HTML in-place via `data-dynamic-*` hooks. **No redirects.**

## Gate 0 — DNS / SSL (before apex route)

Shopify hosts apex on its CDN unless Cloudflare proxies the record. Zone `epirbizuteria.pl` already exists for subdomains (`asystent`, `kazka`, `zareczyny`); apex may still be DNS-only → Shopify.

Before enabling Workers Route `epirbizuteria.pl/*`:

1. CF DNS: `@` / `epirbizuteria.pl` → Shopify origin with **Proxy ON** (orange cloud).
2. SSL/TLS: **Full (strict)**.
3. Origin fetch in worker uses `SHOPIFY_STOREFRONT_DOMAIN` (`.myshopify.com`) — never the public apex (avoids loop).
4. Only then: Workers Route → this worker.

```powershell
Resolve-DnsName epirbizuteria.pl -Type NS
Resolve-DnsName epirbizuteria.pl -Type A
```

If nameservers are not Cloudflare or apex is DNS-only → migrate before Phase B.

## Phase A — code deploy (no apex route)

```powershell
cd workers/dynamic-landing-liquid
npx wrangler kv namespace create CAMPAIGN_CACHE
# Paste real id into wrangler.toml [[kv_namespaces]]

# Reuse existing secret name only (same value as workers/chat):
npx wrangler secret put SHOPIFY_STOREFRONT_TOKEN --env=""

npx wrangler deploy --env=""
```

Do **not** uncomment `routes` in `wrangler.toml` until Gate 0 passes.

## Phase B — enable apex (operator)

1. Proxy apex + Full (strict).
2. Route: `epirbizuteria.pl/*` → `epir-dynamic-landing-liquid`.
3. Smoke:

```bash
curl -sI "https://epirbizuteria.pl/checkout"
curl -s "https://epirbizuteria.pl/?utm_campaign=kazka_b2b" | findstr data-dynamic-hero-title
```

App Proxy chat (`/apps/*`) and checkout must stay pass-through (blocklist in `src/paths.ts`).

## Secrets

| Name | Notes |
|------|--------|
| `SHOPIFY_STOREFRONT_TOKEN` | **Existing** name — same Storefront token as chat/rag online-store. No new secret names. |

Vars in `wrangler.toml`: `SHOPIFY_STOREFRONT_DOMAIN`, `SHOPIFY_STOREFRONT_API_VERSION`, `CAMPAIGN_LANDING_TYPE`.

## Theme hooks

Add attributes in the Liquid section (after `shopify theme pull`):

```liquid
<h1 data-dynamic-hero-title>{{ section.settings.hero_title }}</h1>
<p data-dynamic-hero-subtitle>{{ section.settings.hero_subtitle }}</p>
<div data-dynamic-products>{% section 'featured-collection' %}</div>
<a data-dynamic-cta href="{{ section.settings.hero_cta_url }}" class="btn btn--primary">
  {{ section.settings.hero_cta_label }}
</a>
```

Worker sets `data-campaign-product-ids` on `[data-dynamic-products]` (JSON array of GIDs). Optional theme JS can consume it later.

## Tests

```powershell
cd workers/dynamic-landing-liquid
npx vitest run
```

## Path filter

- Transform: `/`, `/collections/*`, `/products/*`, `/pages/*` + GET/HEAD + UTM present.
- Pass-through: `/checkout`, `/cart`, `/apps/*`, `/account/*`, non-GET, no UTM, missing campaign.
