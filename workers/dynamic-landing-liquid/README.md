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
| `SHOPIFY_STOREFRONT_TOKEN` | **Existing** name — Storefront token with `public_read` on `campaign_mapping` / landings. |

Vars in `wrangler.toml`: `SHOPIFY_STOREFRONT_DOMAIN`, `SHOPIFY_PUBLIC_DOMAIN`, `SHOPIFY_STOREFRONT_API_VERSION`, `CAMPAIGN_LANDING_TYPE`, `ADS_LANDING_HOST`, `SHOPIFY_ORIGIN_IPV4`.

## Ads landing host (Tor Apex) — live

Workers Routes **nie działają** na apexie `A → Shopify` (ruch CF↔Shopify omija Worker). Działa wzorzec jak `asystent`:

1. DNS: `l.epirbizuteria.pl` **CNAME** → `epir-dynamic-landing-liquid.*.workers.dev` (Proxied)
2. Workers Route: `l.epirbizuteria.pl/*` → `epir-dynamic-landing-liquid`
3. Worker renderuje **standalone HTML** z Storefront API (metaobject + produkty) — bez proxy Liquid (fetch do Shopify IP z Workera = 522)

**Final URL w Google Ads (PMax / Search) — landings wyłączone (`LANDINGS_ENABLED=false`):**

- Nie ustawiaj `l.epirbizuteria.pl` jako Final URL asset group — Shopping używa URL produktów z GMC.
- Wyłącz landings: `node scripts/marketing-ops.mjs landings-off`
- Po gotowości treści: `LANDINGS_ENABLED=true` w workerze + `forest-utm` + Final URL `l.…`

Gdy landings włączone:

```
https://l.epirbizuteria.pl/?utm_source=google&utm_medium=cpc&utm_campaign=forest_premium
```

Search per grupa: `utm_campaign=artisan_rings` | `artisan_new` | `organic_art`

Smoke:

```powershell
curl.exe -sI "https://l.epirbizuteria.pl/?utm_campaign=forest_premium"
# expect: X-EPIR-Campaign-Handle: forest-premium-landing
#         X-EPIR-Landing-Mode: standalone
curl.exe -sI "https://epirbizuteria.pl/checkout"
# expect: 302 (apex Shopify nienaruszony)
```

Apex `epirbizuteria.pl` zostaje na Shopify (A `23.227.38.65`). CTA na landingu prowadzą na apex.

### Szablony standalone (Tor Apex)

| Kampania (`utm_campaign`) | Handle metaobiektu | Szablon HTML |
|---------------------------|-------------------|--------------|
| `organic_art` | `organic-art-landing` | **Pełny editorial** — manifesto, Gałązki, współtworzenie UI-only (`src/render-organic-art.ts`) |
| `forest_premium` | `forest-premium-landing` | **Editorial** — manifesto + proces 4 kroki + bestsellery + „Zobacz więcej” (`render-apex-editorial.ts`) |
| `artisan_rings` | `artisan-rings-landing` | j.w. (wariant pierścionki) |
| `artisan_new` | `artisan-new-landing` | j.w. (wariant nowości) |
| `artisan_gold` | `artisan-gold-landing` | j.w. (paleta złota — asset group EPIR_Zloto) |

Kuracja produktów: jawne handlery w `CURATED_HANDLES` w [`scripts/seed-campaign-landings.mjs`](../../scripts/seed-campaign-landings.mjs) (przed fallbackiem collection/query).

Smoke (gdy `LANDINGS_ENABLED=true`):

```powershell
curl.exe -sI "https://l.epirbizuteria.pl/?utm_campaign=organic_art"
# expect: X-EPIR-Campaign-Handle: organic-art-landing
curl.exe -s "https://l.epirbizuteria.pl/?utm_campaign=forest_premium" | findstr proces
curl.exe -s "https://l.epirbizuteria.pl/?utm_campaign=artisan_gold" | findstr "Z.oto formowane"
```

Formularz współtworzenia na `organic_art` jest **UI-only** (walidacja + komunikat sukcesu) — bez backendu uploadu do czasu osobnej szyny danych.

### Podgląd operatora (landings wyłączone dla klientów)

Gdy `LANDINGS_ENABLED=false`, klienci dostają 302 na produkt. **Ty** możesz zobaczyć pełny HTML z parametrem `epir_preview` lub nagłówkiem — wymaga **tego samego** sekretu co Operator Studio / marketing-ops (już w `.dev.vars`):

```powershell
# jednorazowo: skopiuj EPIR_OPERATOR_PANEL_SECRET z root .dev.vars na worker landingu
node scripts/sync-landing-preview-secret.mjs

# URL podglądu:
node scripts/preview-apex-landing.mjs organic_art
```

Alternatywa bez tokenu w URL:

```powershell
curl.exe -H "X-Admin-Key: $env:EPIR_OPERATOR_PANEL_SECRET" "https://l.epirbizuteria.pl/?utm_campaign=organic_art"
```

Odpowiedź podglądu: nagłówek `X-EPIR-Landing-Preview: true`, `Cache-Control: no-store`.

## Theme hooks (opcjonalnie, przyszłość)

Jeśli kiedyś uda się proxy Liquid na apex, atrybuty:

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
