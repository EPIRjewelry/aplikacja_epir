# Orska page design — referencja stron Kazka

**Status:** materiał roboczy — **formalna referencja layoutu stron Kazka** (operator: 2026-09-15)  
**Źródła:** audyt wizualny [orska.pl](https://orska.pl/) (2026-08-14); benchmark [Cartier](https://www.cartier.com/), [Sarah & Sebastian](https://www.sarahandsebastian.com/), [Ecksand](https://ecksand.com/), Lumière (editorial boutique)  
**Zakres:** homepage, kolekcja, PDP oraz reguły UI/fotografii dla `apps/kazka`  
**Router:** przed zmianą layoutu / sizingu / sekcji Kazka — **najpierw ten dokument**, potem kod

---

## Jednym zdaniem

**Home = fotografia z przewagą**; **kolekcja i PDP = zrównoważony commerce**: obraz jest silny, ale kluczowe elementy UI są zawsze widoczne, czytelne i wygodne w użyciu.

UI **nie jest niewidzialne**. „Ciche i małe” oznacza dyskretną estetykę (mała typografia, spokojne CTA), **nie** ukrywanie nawigacji, ceny, wariantów ani przycisku zakupu.

---

## Hierarchia stron (MUST)

| Powierzchnia | Dominanta | UI | Zakaz |
|---|---|---|---|
| **Homepage** | Editorial fill — full-bleed hero, kafle 4:5, ciąg wizualny | Etykiety uppercase, cienki header, CTA pod obrazem | Głośny e-commerce w hero; puste „karty” zamiast fill |
| **Kolekcja** | Siatka produktów (obraz = kafel) + spokojny opis | Sort / filtry / tytuł czytelne; badge i cena pod spodem | Hero full-viewport jak na home; UI schowane za whitespace |
| **PDP (produkt)** | Galeria + panel zakupu w równowadze | Tytuł, cena, opcje, „Do koszyka”, opis — zawsze widoczne i komfortowe | Editorial takeover; wąski, „zmiażdżony” panel; UI traktowane jako dekoracja |

---

## Homepage — reguły

Wzór: ORSKA / Cartier — użytkownik **tonie w obrazie**, UI jest ramą.

1. **Hero full-bleed** — model / detal / lifestyle prawie na cały viewport (pod headerem).
2. **Kafle 4:5** — obraz wypełnia kontener (`object-fit: cover` lub równoważny fill), zero ramek „kart sklepowych”.
3. **Szerokość** — full-bleed tam, gdzie sekcja jest edytorska; bez sztucznego zwężania kadru na desktopie „dla bezpieczeństwa”.
4. **Rytm** — sekcja po sekcji, biała przestrzeń tylko jako **oddech** między dużymi blokami, nie jako główny styl.
5. **Hover** — drugi kadr / wideo w tym samym kafelku, nie flashowe overlaye UI.

```
[ HEADER — cienki, czytelny ]
[ FULL-BLEED HERO — model / kolekcja ]
[ RZĄD PRODUKTÓW — portret 4:5 ]
[ KAFLE KATEGORII — fill, zero ramek ]
[ BLOK EDYTORSKI / VIDEO ]
[ STOPKA ]
```

---

## Kolekcja — reguły

Wzór: ORSKA kolekcje + Cartier listing — discoverability bez rezygnacji z fotografii.

1. **Nagłówek kolekcji** — tytuł + krótki opis; nie full-bleed hero homepage.
2. **Siatka** — obraz jest kartą (4:5), tekst i cena **pod** obrazem, bez cieni i agresywnych ramek.
3. **Kontrolki** — sortowanie / filtry widoczne i używalne (nie „niewidzialny” chrome).
4. **Szerokość desktop** — siatka ograniczona sensownym `max-width` (np. ~7xl), żeby kafle nie rosły do absurdalnej wysokości na ultrawide.
5. **CTA na kaflu** — opcjonalne, spokojne; handel nie musi krzyczeć.

---

## PDP (strona produktu) — reguły

Wzór: Sarah & Sebastian / Ecksand / Lumière / ORSKA PDP — **tu wygrywa jasność zakupu**, nie editorial fill.

1. **Równowaga kolumn** — galeria i panel produktu dzielą uwagę; panel **nie** może być ciasny, „zmiażdżony” ani schowany.
2. **MUST widoczne:** tytuł, cena, warianty/opcje, przycisk zakupu, opis / kluczowe dane (materiał, rozmiar, dostępność).
3. **Komfort UI** — hit area przycisków i selektorów wystarczająca; kontrast tekstu czytelny; spacing wokół CTA.
4. **Galeria** — mocna, ale ograniczona wysokością viewportu (np. max ~70vh), żeby nie wypychać panelu poza pierwszy ekran.
5. **Whitespace** — służy czytelności i hierarchii, **nie** pustce wokół mikroskopijnego UI.
6. **Zakaz** przenoszenia reguły „home = 100% fill” 1:1 na PDP.

---

## Zasada UI (wszystkie strony)

| Pojęcie | Znaczenie | Nie oznacza |
|---|---|---|
| **Ciche UI** | Spokojna typografia, bez krzykliwych kolorów i agresywnych badge’y | Niewidoczne / nieczytelne elementy |
| **Małe UI** | Skala etykiet i chrome nie konkuruje z fotografią na home | Za małe przyciski, ukryte CTA, niedostępne kontrolki |
| **Widoczne UI** | Nawigacja, cena, zakup, filtry — zawsze dostrzegalne i klikalne | „Cienka rama” kosztem użyteczności |

Operator: **komfort używania przycisków i widoczność istotnych elementów są podstawą**; fotografia prowadzi, ale UI prowadzi użytkownika.

---

## Paleta (referencyjna ORSKA)

| Token | Wartość | Użycie |
|---|---|---|
| Tło UI | `#FFFFFF` | canvas |
| Tekst | `#2C3238` | body, linki, ceny |
| Obramowania / CTA outline | `#F2F2F2` | przyciski spokojne, separatory |
| Akcenty | z fotografii | beż, złoto, skóra, kamień |

Kazka zachowuje własne tokeny marki (`apps/kazka` / Cormorant); z ORSKA bierzemy **filozofię fill + hierarchię stron**, nie kopiujemy fontów 1:1.

---

## Typografia (zmierzone na ORSKA)

- Body ~12px / lh 18px — dyskretny tekst UI
- H2 sekcji ~18px, weight 400, UPPERCASE, tracking ~1px — etykieta redakcyjna
- Przyciski spokojne; na PDP kontrast CTA musi pozostać wystarczający do wygodnego kliknięcia

---

## Fotografia

- Lifestyle + produkt w jednym kadrze (home / kafle)
- Na PDP: czytelne zdjęcia produktu + detal; zoom / galeria ważniejsze niż pełnoekranowy storytelling
- Ciepłe światło, tła jednolite (beż, off-white)
- Kafle listingowe ~4:5

---

## Interakcje

- Subtelne — bez flashowych animacji
- Hero: slider zamiast statycznego banera (home)
- Hover produktu: drugi kadr / wideo w kaflu
- PDP: fokus na wyborze wariantu i zakupie, nie na spektaklu UI

---

## Implikacje dla Kazka (MUST przed edycją UI)

Przed zmianą layoutu / sizingu / sekcji w `apps/kazka` (home, `/collections/*`, `/products/*`):

1. Przeczytaj **ten dokument**.
2. Zastosuj reguły **tej powierzchni** (home ≠ kolekcja ≠ PDP).
3. Świadomie dobierz obrazy do kafli i bloków — patrz [`apps/kazka/docs/KAZKA_PAGE_ALIGNMENT.md`](../../apps/kazka/docs/KAZKA_PAGE_ALIGNMENT.md) § Image governance.
4. Nie przenoś „editorial fill” z homepage na PDP; **nie mieszaj** ToV / identyfikacji EPIR z Kazką.
5. Zachowaj: kafle 4:5 na listingach, full-bleed hero na home, widoczne CTA i opcje na PDP.
6. Po zmianie: sprawdź desktop **i** mobile; macierz QA w [`KAZKA_PAGE_ALIGNMENT.md`](../../apps/kazka/docs/KAZKA_PAGE_ALIGNMENT.md).

### Checklist krótkiej weryfikacji

- [ ] Home: fotografia dominuje; header i CTA nadal czytelne
- [ ] Kolekcja: siatka 4:5; sort/filtry używalne; kafle nie „olbrzymie” na szerokim desktopie
- [ ] PDP: panel zakupu widoczny i wygodny; galeria nie pożera viewportu; brak podwójnego paddingu / ciasnego `max-w`

---

## Tokeny CSS (robocze, nie kanon marki EPIR)

```css
/* ORSKA-inspired — referencja layoutu Kazka */
--orska-bg: #ffffff;
--orska-text: #2c3238;
--orska-border: #f2f2f2;
--orska-tile-ratio: 4 / 5;
--orska-label-size: 12px;
--orska-label-tracking: 0.08em;
--orska-section-title-size: 18px;
```

---

## Notatki z audytu / research

- ORSKA home: długa strona, hero pełnej szerokości, kafle ~340×425 (ratio ~0,80), `object-fit: fill`
- ORSKA kolekcja: opis + CTA „Poznaj kolekcję” + siatka; UI sortowania widoczne
- Cartier: restraint, white space, storytelling na home; listing i PDP z jasną hierarchią ceny / produktu
- Sarah & Sebastian / Ecksand / Lumière: PDP z trust, materiałami, packingiem — commerce czytelny mimo luksusowego tonu

---

*Referencja formalna dla decyzji layoutu Kazka. Przy konflikcie z kodem produkcyjnym: zaktualizuj kod albo ten dokument po decyzji operatora; nie utrzymuj sprzecznych „dwóch prawd”.*
