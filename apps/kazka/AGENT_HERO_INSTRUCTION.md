# Polecenie dla agenta: Hero na stronie głównej (image + video + CTA)

## Cel

Zaktualizuj Section Hero w `apps/zareczyny` tak, aby:
1. Obsługiwał **obraz i film** (jak hydrogen.demo) – przez `MediaFile` z Hydrogen
2. Używał **prostych pól CTA** (cta_href, cta_text, cta_target) zamiast metaobject_reference

## Kroki do wykonania

### 1. Definicja metaobiektu section_hero (Admin – ręcznie)

W **Shopify Admin** → Settings → Custom data → Metaobjects → **Section Hero** → Add field:

| Pole       | Typ                    | Opis                                  |
|------------|------------------------|---------------------------------------|
| cta_href   | single_line_text_field | URL przycisku CTA                      |
| cta_text   | single_line_text_field | Tekst przycisku (np. „Zobacz kolekcję”)|
| cta_target | single_line_text_field | Opcjonalnie: `_blank` dla nowej karty  |

Pole `image` (file_reference) już istnieje – obsługuje zarówno obrazy, jak i filmy z Files.

### 2. Fragment GraphQL (Sections.tsx)

W pliku `apps/zareczyny/app/sections/Sections.tsx` w `SECTION_HERO_FRAGMENT`:

- **Usuń** `link: field(key: "link") { ... }`
- **Dodaj** pola: `cta_href`, `cta_text`, `cta_target` jako `field(key: "...") { value }`
- **Rozszerz** pole `image` o obsługę `Video` (obecnie tylko MediaImage):

```graphql
image: field(key: "image") {
  key
  reference {
    __typename
    ... on MediaImage {
      mediaContentType
      alt
      previewImage { url }
      image { url altText width height }
    }
    ... on Video {
      mediaContentType
      alt
      previewImage { url }
      sources { mimeType url }
    }
  }
}
cta_href: field(key: "cta_href") { key type value }
cta_text: field(key: "cta_text") { key type value }
cta_target: field(key: "cta_target") { key type value }
```

### 3. Komponent SectionHero.tsx

W pliku `apps/zareczyny/app/sections/SectionHero.tsx`:

**a) Import:** dodaj `MediaFile` z `@shopify/hydrogen` (lub `@shopify/hydrogen-react` – sprawdź, co jest używane w projekcie).

**b) Propsy:** dodaj `cta_href`, `cta_text`, `cta_target` (wartość może być `{ value?: string }` lub `string`). Zachowaj fallback na stary format `link` dla kompatybilności.

**c) Media:** zamiast `backgroundImage` w `style` użyj `MediaFile`:
- Umieść media w kontenerze `absolute inset-0 -z-10` (pełny ekran, za overlay)
- Przekaż `reference` z `image` do `MediaFile` jako `data`
- Opcje dla wideo (jak hydrogen.demo): `controls: false`, `muted: true`, `loop: true`, `playsInline: true`, `autoPlay: true`, `previewImageOptions`
- Opcje dla obrazu: `loading: 'eager'`, `crop: 'center'`, `sizes: '100vw'`, `alt`

**d) CTA:** jeśli `cta_href` (lub `cta_href?.value`) istnieje, renderuj `Link` z:
- `to={cta_href.value ?? cta_href}`
- `children={cta_text?.value ?? cta_text ?? 'Dowiedz się więcej'}`
- jeśli `cta_target?.value === '_blank'` lub `cta_target === '_blank'`: `target="_blank" rel="noopener"`

**e) Wyciąganie wartości:** helper do pól metaobject – jeśli pole ma postać `{ value: "..." }`, użyj `value`; w przeciwnym razie traktuj jako string.

### 4. METAOBJECTS_SETUP.md

Zaktualizuj opis Section Hero: zamiast `link` (metaobject_reference) opisz pola `cta_href`, `cta_text`, `cta_target`.

### 5. Weryfikacja

- Uruchom `npm run build` w `apps/zareczyny` – build musi przejść
- Hero powinien wyświetlać obraz lub film w tle oraz przycisk CTA (gdy pola są wypełnione)

## Referencje

- Hydrogen demo Hero: `Shopify/hydrogen-demo-store` → `app/components/Hero.tsx` (MediaFile, SpreadMedia)
- Hydrogen demo fragments: `app/data/fragments.ts` → MEDIA_FRAGMENT (MediaImage, Video)
- Istniejący ProductGallery w projekcie używa `MediaFile` – wzór importu i użycia
