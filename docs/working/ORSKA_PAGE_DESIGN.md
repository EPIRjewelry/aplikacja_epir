# Orska page design

**Status:** materiał roboczy (niewiążący)  
**Źródło:** audyt wizualny [orska.pl](https://orska.pl/) — 2026-08-14  
**Kontekst:** kompas stylistyczny dla Kazka / storefrontów EPIR (UI/UX, karty produktu, homepage)

---

## Jednym zdaniem

**ORSKA = editorial fill** — każdy blok wizualny jest w 100% wypełniony fotografią; typografia i commerce są wtórne, ciche, uppercase, małe.

Cichy, redakcyjny luksus artystyczny: strona to przede wszystkim **pełnoekranowa fotografia**, a UI jest tylko cienką ramą wokół niej.

---

## „All the fill” — rdzeń estetyki

To nie jest styl „biała karta + małe zdjęcie produktu”. To styl **wypełnienia**:

| Warstwa | Jak to działa |
|---|---|
| **Hero** | Zdjęcie/model zajmuje prawie cały viewport — ciepłe beże, skóra, biżuteria w kadrze |
| **Kafle** | Obraz **wypełnia cały kontener** (CSS `object-fit: fill`), proporcja ~**4:5** (portret) |
| **Szerokość** | Layout **full-bleed** (`max-width: 100%`) — brak wąskiej kolumny sklepu |
| **Gęstość** | Długa, ciągła strona (~5,5k px) — sekcja po sekcji, bez dużych pustych odstępów |
| **Tło** | Białe UI, ale **wizualnie dominuje fotografia**, nie puste tło |

Efekt: użytkownik **tonie w obrazie**, nie w interfejsie.

---

## Paleta

| Token | Wartość | Użycie |
|---|---|---|
| Tło UI | `#FFFFFF` | canvas strony |
| Tekst | `#2C3238` (rgb 44, 50, 56) | body, linki, ceny |
| Obramowania / CTA | `#F2F2F2` | przyciski outline, separatory |
| Akcenty koloru | z fotografii | ciepły beż, złoto, skóra, kamienie |

Brak mocnych kolorów brandowych w UI. Marka „mówi” zdjęciem.

---

## Typografia (zmierzone na żywo)

- **Font:** Open Sans (sans-serif, neutralny)
- **Body:** 12px / line-height 18px — mały, dyskretny tekst
- **Nagłówki sekcji (H2):** 18px, weight 400, **UPPERCASE**, `letter-spacing: 1px` — etykieta redakcyjna, nie krzykliwy tytuł
- **Przyciski:** Arial 12px, białe tło, cienka ramka `#F2F2F2`, padding ~4×10px
- **Ceny / CTA:** cicho, bez grubych fontów

Ton: **galeria sztuki**, nie agresywny e-commerce.

---

## Layout i rytm strony

```
[ FULL-BLEED HERO — model / kolekcja ]
[ RZĄD PRODUKTÓW — portret 4:5, obraz = kafel ]
[ KAFLE KATEGORII — znowu fill, zero ramek ]
[ BLOKI EDYTORSKIE — blog, kolekcje, „Świat ORSKA” ]
[ STOPKA — minimalna ]
```

- Siatka produktów: **obraz jest kartą** — tekst pod spodem, bez cieni, bez zaokrągleń
- Przyciski „Do koszyka”: białe, cienka ramka, mały padding — handel schowany za treścią
- Menu: hamburger + logo — header nie konkuruje z fotografią
- Platforma: Shoper Premium (klasyczny polski sklep, ale „opakowany” redakcyjnie)

---

## Fotografia (najważniejszy element brandu)

- **Lifestyle + produkt** w jednym kadrze (modelka, ręce, detal biżuterii)
- Ciepłe, miękkie światło studyjne
- Tła jednolite (beż, piasek, off-white)
- Narracja: *„ręcznie robione”, „kolekcja”, „pracownia”, „Anna Orska”* — marka osobista, artystyczna
- Kafle produktowe i hero: ~340×425 px (ratio 0,80 = 4:5), `object-fit: fill`

---

## Interakcje

- Subtelne — bez flashowych animacji
- Slider hero zamiast statycznego banera
- Hover na produkcie raczej przez **drugi kadr / wideo** niż przez UI (prosto technicznie, efektownie wizualnie)

---

## Implikacje dla Kazka (EPIR)

Jeśli zbliżamy Kazkę do tego stylu, kluczowe nie są same fonty, tylko **filozofia fill**:

1. **Kafel produktu = pełny obraz 4:5**, nie kwadrat z szarą ramką
2. **Hero full-bleed** z modelem/detalem, nie mały banner
3. **Mniej UI, więcej fotografii** — ceny i CTA cicho pod spodem
4. **Hover = drugi kadr / film** wypełniający cały kafel (kierunek już wdrożony w `ProductCard`)
5. **Biała przestrzeń tylko jako oddech** między dużymi blokami, nie jako domyślny styl karty

### Kontrast z obecnym Kazka (skrót)

| ORSKA | Kazka (obecnie) |
|---|---|
| Portret 4:5, fill | Kwadrat `aspect-square`, `object-cover` |
| Full-bleed hero | CMS sekcje / mniejszy hero |
| Cichy commerce | Wyraźniejsze CTA, filtry kolekcji |
| Open Sans 12px uppercase labels | Własna typografia marki Kazka |

---

## Tokeny do ewentualnego przeniesienia (CSS)

```css
/* ORSKA-inspired (robocze, nie kanon marki EPIR) */
--orska-bg: #ffffff;
--orska-text: #2c3238;
--orska-border: #f2f2f2;
--orska-tile-ratio: 4 / 5;
--orska-label-size: 12px;
--orska-label-tracking: 0.08em; /* ~1px przy 12px */
--orska-section-title-size: 18px;
```

---

## Notatki techniczne z audytu

- Strona główna: długość ~5524 px, hero slider pełnej szerokości
- Widoczne kafle obrazów: 340–355 × 425–444 px, ratio 0,80
- Wszystkie zmierzone `<img>` na homepage: `object-fit: fill`
- Sekcja produktów: „Wybrane dla Ciebie” + siatka z CTA „Do koszyka”

---

*Niewiążące do czasu weryfikacji z `REVIEW.md`, kanonem UI EPIR i decyzją operatora.*
