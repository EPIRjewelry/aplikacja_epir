# Kazka — wyrównanie do referencji Orska (layout)

**Status:** operacyjna referencja implementacji Kazka  
**Router layoutu:** [`docs/working/ORSKA_PAGE_DESIGN.md`](../../../docs/working/ORSKA_PAGE_DESIGN.md)  
**Marka:** Kazka Jewelry — Orska to **tylko** kompozycja i art direction, nie język EPIR Art Jewellery.

---

## 0. Zaimplementowano teraz vs roadmap CMS

| Obszar | Stan w kodzie (teraz) | Roadmap (później) |
|---|---|---|
| Hero home | CMS `section_hero` przez `route.sections` | — |
| Featured products | CMS `section_featured_products` | — |
| Kafle kategorii | kod: `KAZKA_EDITORIAL_CATEGORIES` + assety | metaobiekt `section_category_tiles` + pole Route |
| Video kolekcji | kod: `KAZKA_EDITORIAL_COLLECTION_VIDEO` | metaobiekt `section_editorial_video` + pole Route |
| Siatki listing / featured | `max-w-7xl`, proporcja 4:5, bez `shadow-sm` na featured | — |
| PDP galeria | desktop: `max-w-[min(100%,70vh)]`; mobile: pełna szerokość; zoom in-place na IMAGE (CDN 2048) w shared `ProductGallery` | — |
| PDP panel Kazka | chrom lokalny: etykieta Kazka, kamień przy cenie z metafield; chipy + CTA ze shared `@epir/ui` | dodatkowe pola produktowe gdy zweryfikowane w Shopify |
| PDP trust | linki do Wysyłka / Zwroty / Czat (bez kamienia — kamień przy cenie) | dodatkowe pola produktowe gdy zweryfikowane w Shopify |
| A11y / motion | `prefers-reduced-motion` na kafelach; min-height CTA PDP | — |

**Zasada trust:** blok PDP nie zawiera twierdzeń per SKU (np. opakowanie, technika wykonania), dopóki nie pochodzą z danych produktu lub stron sklepu.

---

## 1. Diagnoza (stan vs referencja)

| Powierzchnia | Zgodne | Luki |
|---|---|---|
| **Home** | Full-bleed hero (CMS), kafle 4:5 featured + kategorie, hover wideo/obraz | Kafle kategorii były zwężone (`max-w-6xl`); featured miały `shadow-sm` (poza Orska); video OK po `md:min-h-0` |
| **Kolekcja** | Siatka 4:5, filtry widoczne | Brak spójnego `max-w-7xl`; karty z dużym `gap-4` — zbyt „sklepowe” |
| **PDP** | Galeria + sticky panel, warianty, CTA, trust (linki + kamień z metafield) | Silniejsze claimy produktowe tylko po podłączeniu danych CMS/metafields |

**Nie mieszamy:** copy / ToV EPIR (organika, warsztat na skórze) z Kazką (geometria, blask, spokój).

---

## 2. Image governance

| Powierzchnia | Proporcja | Typ kadru | Crop | Fallback |
|---|---|---|---|---|
| Hero (CMS) | viewport fill | lifestyle + detal biżuterii | `object-cover` | `KAZKA_HERO_SLIDES` w kodzie |
| Featured (CMS) | 4:5 | produkt na neutralnym/beżu | `object-cover` | placeholder „—”, sekcja ukryta gdy brak produktów |
| Kafle kategorii | 4:5 | lifestyle z czytelnym detalem | `object-cover` | statyczne assety w `kazka-editorial-assets.ts` |
| Listing | 4:5 | packshot / model | `object-cover` | „Brak zdjęcia” |
| PDP galeria | 1:1 (desktop max ~70vh; mobile pełna szerokość) | packshot, detal, wideo | `object-cover` | pierwsze media z Shopify |

**Zasady operacyjne (operator / content):**

1. Jedno dominujące źródło światła; tło beż/off-white.
2. Na home **nie** mieszać packshotów bez kontekstu z pełnoekranowym lifestyle.
3. Kadry pod 4:5 — centrować biżuterię; unikać obcięcia kamienia przy cropie.
4. Hover (drugi kadr / MP4) — ten sam kadr, inna oświetlenie lub ruch, nie inny produkt.

---

## 3. Model CMS (Shopify metaobjects)

**Wdrożone w produkcji:** Hero i Featured products (metaobiekty + parsery `kazka-cms-*.ts`).  
**Nadal w kodzie (roadmap):** kafle kategorii i video — patrz sekcja 0.

| Sekcja | Źródło dziś | Docelowo |
|---|---|---|
| Hero | `route.sections` → `section_hero` | ✅ metaobiekt (już) |
| Featured products | `route.featured_products` → `section_featured_products` | ✅ metaobiekt (już) |
| Kafle kategorii | kod: `KAZKA_EDITORIAL_CATEGORIES` | opcjonalnie `section_category_tiles` + pole `category_tiles` na Route |
| Video kolekcji | kod: `KAZKA_EDITORIAL_COLLECTION_VIDEO` | opcjonalnie `section_editorial_video` na Route |

**Kolejność renderu home (kod):** Hero → Featured Products → Category Tiles → Video.

**Właściciel treści:** operator w Shopify Admin (Content → Metaobjects); dev utrzymuje parsery w `app/lib/kazka-cms-*.ts`.

Szczegóły setup: [`METAOBJECTS_SETUP.md`](../METAOBJECTS_SETUP.md).

---

## 4. Macierz QA (przed deploy)

| Scenariusz | Home | Kolekcja | PDP |
|---|---|---|---|
| Desktop 1440px | hero fill, brak poziomego scrolla | siatka 3–4 kolumny, filtry klikalne | panel + galeria w jednym viewportcie |
| Ultrawide 1920+ | bleed bez rozjechania | kafle nie „wieżowe” (`max-w-7xl`) | galeria desktop `max 70vh` |
| Tablet | bez zmian mobile layout | 2–3 kolumny | sticky panel |
| Mobile | `min-h-[50vh]` video | 2 kolumny | pełna szerokość CTA |
| Długi tytuł produktu | — | — | bez overflow, CTA widoczne |
| Brak zdjęcia produktu | — | placeholder karty | galeria null-safe |
| Brak wariantu / ceny | — | — | komunikat „Wybierz wariant…” |
| `prefers-reduced-motion` | bez scale hover na kafelach | — | — |

---

## 5. Performance i dostępność

- Hero LCP: pierwszy slajd `loading="eager"` / `fetchpriority="high"` (już w `KazkaEditorialHero`).
- Listing / kafle: `loading="lazy"`.
- Hover video: `preload="metadata"`, pauza on mouse leave.
- CTA / przyciski PDP: min. ~44px wysokości (`.kazka-pdp-panel`).
- Focus: `focus-visible` na linkach nawigacji i miniaturach galerii.
- `prefers-reduced-motion`: wyłączenie `scale` na kafelach kategorii (`app.css`).
