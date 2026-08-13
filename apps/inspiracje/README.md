# Archiwum Inspiracji — Hydrogen na Cloudflare Pages

Subdomena: **`https://inspiracje.epirbizuteria.pl`**  
Projekt Pages: `inspiracje-hydrogen-pages`  
Kanon domen: [`docs/EPIR_STOREFRONT_DOMAIN_STRATEGY.md`](../../docs/EPIR_STOREFRONT_DOMAIN_STRATEGY.md)

## Cel

Galeria wyrobów **sprzedanych** (`tag:sprzedane`) — zdjęcia i opisy bez cen, z CTA do współtworzenia (`https://epirbizuteria.pl/pages/zaprojektuj-swoj-model`).

Dane pochodzą ze snapshotu build-time: [`app/data/archive-inspirations.json`](app/data/archive-inspirations.json), generowanego skryptem Admin API.

## Lokalnie

```bash
# z roota monorepo
npm install --legacy-peer-deps --no-audit --no-fund
cp apps/inspiracje/.dev.vars.example apps/inspiracje/.dev.vars

# opcjonalnie: wypełnij archiwum (wymaga SHOPIFY_ADMIN_TOKEN)
node scripts/export-archive-inspirations.mjs

# albo smoke UI na fixture (bez Admin API):
# cp apps/inspiracje/app/data/archive-inspirations.fixture.json \
#    apps/inspiracje/app/data/archive-inspirations.json

cd apps/inspiracje
npm run build
npm run wrangler   # pages dev ./public --local  (domyślnie :8788 jeśli wolny port)
```

**Smoke zweryfikowany (cloud):** `GET /` → 200, `GET /inspiracje/:handle` → 200, nieistniejący handle → 404; brak UI koszyka/cen.
## Eksport

```bash
node scripts/export-archive-inspirations.mjs --dry-run
node scripts/export-archive-inspirations.mjs
# ARCHIVE_COLLECTION_HANDLE=...  — alternatywa do tag:sprzedane
# ARCHIVE_PRODUCT_QUERY=tag:sprzedane
```

## Deploy

```bash
# root
npm run pages:deploy:inspiracje
```

Lub workflow `.github/workflows/deploy-inspiracje-archive.yml` (`workflow_dispatch` / cron).

**Uwaga:** pierwszy deploy wymaga utworzenia projektu Pages `inspiracje-hydrogen-pages` oraz CNAME `inspiracje` → Pages (operator w Cloudflare). Nie wdrażaj bez zgody operatora.

## Link ze sklepu głównego

Motyw apex jest stubem w repo — po `shopify theme pull` dodaj snippet:

[`themes/epir-online-store/snippets/archive-inspirations-link.liquid`](../../themes/epir-online-store/snippets/archive-inspirations-link.liquid)

oraz wpis w Navigation (Online Store → Navigation) wskazujący na `https://inspiracje.epirbizuteria.pl`.

## Poza zakresem

Koszyk, Storefront API produktów, GMC, Ads, landingi Apex (`l.epirbizuteria.pl`).
