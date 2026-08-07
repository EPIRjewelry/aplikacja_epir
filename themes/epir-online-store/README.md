# Motyw Online Store — epirbizuteria.pl (apex)

Ten katalog jest **wyłącznie** dla głównego sklepu Shopify na `epirbizuteria.pl` (motyw OS 2.0).

Hydrogen (Zaręczyny, Kazka) na subdomenach Cloudflare Pages — patrz [`docs/EPIR_STOREFRONT_DOMAIN_STRATEGY.md`](../../docs/EPIR_STOREFRONT_DOMAIN_STRATEGY.md).

Theme App Extension (czat Gemma) jest w `extensions/asystent-klienta` — deploy przez `shopify app deploy`, **nie** `theme push`.

## Pierwszy pull (operator)

Wymaga: Shopify CLI zalogowany (`shopify auth login`), dostęp do sklepu `epir-art-silver-jewellery`.

```bash
cd themes/epir-online-store
shopify theme pull --store epir-art-silver-jewellery.myshopify.com --path .
```

Opcjonalnie tylko aktywny motyw:

```bash
shopify theme pull --live --path .
```

## Dev lokalny

```bash
shopify theme dev --store epir-art-silver-jewellery.myshopify.com
```

## Push (ostrożnie)

```bash
shopify theme push --only config/sections/...   # preferuj selektywny push
```

Pełny `theme push` tylko po review — ryzyko nadpisania zmian z edytora motywu.

## Rozwój wizualny

- Kanon: [`REVIEW.md`](../../REVIEW.md) — `image_url` / `image_tag`, `collection_enhanced`, paleta.
- Metafieldy: [`docs/EPIR_ADMIN_METAFIELDS_CHECKLIST.md`](../../docs/EPIR_ADMIN_METAFIELDS_CHECKLIST.md).
- Nie duplikuj pełnego UI z Hydrogen — wspólne są **dane** (metafieldy), nie całe sekcje React.

## Dynamic campaign hooks (HTMLRewriter)

Worker [`workers/dynamic-landing-liquid`](../../workers/dynamic-landing-liquid) nadpisuje treść na edge, gdy URL ma UTM mapowane w `shop.metafields.app.campaign_mapping`. W sekcji hero (po `theme pull`) dodaj atrybuty:

```liquid
<h1 data-dynamic-hero-title>{{ section.settings.hero_title }}</h1>
<p data-dynamic-hero-subtitle>{{ section.settings.hero_subtitle }}</p>
<div data-dynamic-products>
  {%- comment -%} Worker ustawi data-campaign-product-ids="[...]". {%- endcomment -%}
  {% section 'featured-collection' %}
</div>
<a data-dynamic-cta href="{{ section.settings.hero_cta_url }}" class="btn btn--primary">
  {{ section.settings.hero_cta_label }}
</a>
```

Selektywny push sekcji po zmianie. Bez tych atrybutów worker pass-through działa, ale HTML nie zmienia się widocznie.

## Pliki w repo

Po `theme pull` pojawią się m.in. `layout/`, `sections/`, `templates/`, `config/`.  
`shopify.theme.toml` identyfikuje projekt dla CLI.
