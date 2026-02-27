# Konfiguracja metaobiektów dla dynamicznej Home Page

Definicje i wpis `route-home` zostały utworzone przez MCP. Wykonaj poniższe kroki ręcznie w **Shopify Admin**.

## Ograniczenie platformy Shopify

**Shopify nie pozwala na wiele typów w jednym polu `list.metaobject_reference`.** Zamiast jednego pola `sections` z mieszanymi typami, Route ma 3 osobne pola. Kolejność renderowania w kodzie: Hero → Featured Collections → Featured Products.

## Stan po automatyzacji MCP

- **link** – definicja utworzona (href, text, target)
- **section_hero** – definicja utworzona (heading, subheading, image, cta_href, cta_text, cta_target)
- **section_featured_collections** – definicja utworzona
- **section_featured_products** – definicja utworzona
- **route** – definicja z polem `title`; **wymaga 3 pól:** `sections`, `featured_collections`, `featured_products`
- **route-home** – wpis utworzony (handle: `route-home`, title: „Strona główna”)
- **route-zareczyny-home** – docelowy wpis dla storefrontu Zareczyny (zalecany)

## 0. Migracja handle do route-zareczyny-home (zalecane)

Kod storefrontu Zareczyny najpierw szuka `route-zareczyny-home`, a jeśli wpis jeszcze nie istnieje, używa fallbacku `route-home`.

1. Content → **Metaobjects** → **Route** → utwórz wpis **route-zareczyny-home**
2. Ustaw pola:
  - **sections** → `hero-pierscionki` (lub odpowiednik dla Zareczyn)
  - **featured_collections** → `featured-collections-pierscionki`
  - **featured_products** → `featured-products-pierscionki`
3. Zapisz
4. (Po 1–2 stabilnych deployach) możesz zostawić `route-home` jako alias albo usunąć go z użycia operacyjnego.

## 1. Dokończenie definicji Route (ręcznie)

1. Settings → Custom data → Metaobjects → **Route**
2. **Add field** – dodaj 3 pola (każde List of metaobjects, jeden typ na pole):
   - **sections** → List of **Section Hero**
   - **featured_collections** → List of **Section Featured Collections**
   - **featured_products** → List of **Section Featured Products**
3. Zapisz

## 2. Pola CTA w Section Hero (ręcznie)

1. Settings → Custom data → Metaobjects → **Section Hero** → Add field
2. Dodaj pola:
   - **cta_href** (single_line_text_field) – URL przycisku CTA
   - **cta_text** (single_line_text_field) – Tekst przycisku (np. „Zobacz kolekcję”)
   - **cta_target** (single_line_text_field) – Opcjonalnie: `_blank` dla nowej karty

Pole **image** (file_reference) obsługuje obrazy i filmy z Files.

### Automatyzacja GraphQL (alternatywa dla kroku 2)

Możesz dodać pola CTA przez skrypt Admin API zamiast ręcznie:

```bash
# 1. Dodaj token do .dev.vars (lub ustaw zmienną środowiskową):
#    SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx

# 2. Uruchom skrypt:
node scripts/add-cta-fields-section-hero.mjs
```

Token: Shopify Admin → Settings → Apps → Develop apps → Create app → Configure Admin API → scope `write_metaobject_definitions`.

Alternatywnie – mutacja GraphQL ręcznie:

**Krok 1 – pobierz ID definicji (jeśli nie znasz):**

```graphql
query GetSectionHeroDefinitionId {
  metaobjectDefinitions(first: 50) {
    edges {
      node {
        id
        name
        type
      }
    }
  }
}
```

Znajdź `type: "section_hero"` i skopiuj `id`.

**Krok 2 – mutacja:**

```graphql
mutation AddCtaFieldsToSectionHeroDefinition($id: ID!) {
  metaobjectDefinitionUpdate(
    id: $id
    definition: {
      fieldDefinitions: [
        { create: { name: "CTA href", key: "cta_href", type: "single_line_text_field" } }
        { create: { name: "CTA text", key: "cta_text", type: "single_line_text_field" } }
        { create: { name: "CTA target", key: "cta_target", type: "single_line_text_field" } }
      ]
    }
  ) {
    metaobjectDefinition { id name type fieldDefinitions { name key } }
    userErrors { field message code }
  }
}
```

**Zmienna:** `{ "id": "gid://shopify/MetaobjectDefinition/34415870284" }`

**Wymagania:** Admin API access token z scope `write_metaobjects`, URL: `https://{shop}.myshopify.com/admin/api/2024-01/graphql.json`

## 3. Storefront API access (WYMAGANE)

**Bez tego Storefront API zwraca `null` dla route-home – strona pokazuje FallbackView zamiast dynamicznej treści.**

### Opcja A – skrypt (wymaga tokenu Admin API)

```bash
# 1. Dodaj do .dev.vars: SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx
# 2. Uruchom:
node scripts/enable-storefront-access.mjs
```

### Opcja B – ręcznie w Shopify Admin

1. **Settings** → **Custom data** → **Metaobjects**
2. Dla każdej definicji włącz **Storefront API access**:
   - **Route**
   - **Section Hero**
   - **Section Featured Collections**
   - **Section Featured Products**
3. Ścieżka: Metaobjects → [definicja] → Metaobject options → **Storefront API access** = ON
4. Zapisz (**Save**)

## 4. Konfiguracja route-zareczyny-home (oraz aliasu route-home)

1. Content → **Route** → wpis **route-zareczyny-home**
2. Wypełnij 3 pola:
  - **sections** – dodaj wpisy Section Hero (np. hero-pierscionki)
  - **featured_collections** – dodaj wpisy Section Featured Collections (np. featured-collections-pierscionki)
  - **featured_products** – dodaj wpisy Section Featured Products (np. featured-products-pierscionki)
3. Kolejność renderowania: Hero → Collections → Products (ustalona w kodzie)
4. Zapisz

Opcjonalnie: utrzymaj te same referencje także w `route-home` jako alias przejściowy.

## 5. Token Storefront API

W **Headless** → Storefront API permissions upewnij się, że są włączone:
- `unauthenticated_read_metaobjects` – wymagane dla metaobiektów
- `unauthenticated_read_product_listings` – **wymagane dla obrazów z Files** (GenericFile w polu file_reference)
