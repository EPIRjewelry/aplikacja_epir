# Feed GMC + struktura sklepu — zestawienie

**Status:** materiał roboczy (mirror do wątków Cursor). Niewiążący do czasu wchłonięcia do kanonu.  
**Ostatnia aktualizacja:** 2026-08-11  
**Źródła kodu:** `epir-marketing-ingest/` · `scripts/lib/epir-metal-label.mjs` · `scripts/audit-epir-shopping-eligibility.mjs`  
**Źródło operatora:** [`LANDINGS_APEX_HANDOFF.md`](LANDINGS_APEX_HANDOFF.md) § Model sklepu

---

## 1. Model sklepu (operator)

Ustalenia operatora — **źródło prawdy dla feedu, Ads i porządkowania**. Nie interpretować kreatywnie do czasu zakończenia dywagacji operatora.

### Kategorie podstawowe (cały aktywny katalog)

| Kategoria operacyjna | Uwagi |
|----------------------|--------|
| BRANSOLETKI SREBRNE | |
| KOLCZYKI SREBRNE | |
| PIERŚCIONKI/OBRĄCZKI SREBRNE | |
| WISIORY I NASZYJNIKI SREBRNE | |
| BIŻUTERIA ZŁOTA | bez podziału na podkategorie wewnątrz |

Feed i reklamy powinny się na nich oprzeć (ew. zawężenie kolekcją reklamową, np. Gałązki — ten sam towar).

### NOWOŚCI — rola operacyjna (nie informacyjna)

- **Nie** „co nowe w sklepie”.
- **Jest:** sekcja na home + rezerwuar **aktywnych** wyrobów do sprzedaży.
- Reguła Shopify: tag `nowość` → smart collection `nowosci-1` (175+ pozycji w API).
- Wszystkie aktywne i łatwe do wykonania wyroby **powinny być** w NOWOŚCIACH operacyjnie.
- Osobny landing/reklama „nowości” — **kwestionowane** (`artisan_new` w handoffu landingów).

### Pozostałe kolekcje

Gałązki, Planety, według kamienia itd. = **te same wyroby** co w kategoriach podstawowych, tylko inne sortowanie.

### Archiwum Inspiracji

- Produkty **sprzedane** — inspiracja do zamówień, bałagan w sklepie.
- **Musi być wykluczone z feedu** (tag `sprzedane`).

### Kierunek roboczy (feed / Ads)

- Feed opierać o **kategorie podstawowe** (ew. zawężenie kolekcją reklamową).
- Reklamować według **klucza intencji** zakupowej — nie kategorii sklepu typu „nowości”.
- **Czekać** na dalsze dywagacje operatora przed kreatywnymi propozycjami.

---

## 2. Pipeline feedu (jak jest w kodzie)

| Krok | Gdzie | Co robi |
|------|--------|---------|
| 1 | `epir-marketing-ingest/src/shopify_client.ts` | GraphQL Admin API — produkty wg `config/shopify.json` → `productQuery` |
| 2 | `epir-marketing-ingest/src/transform.ts` | Wariant → wiersz GMC (tytuł, opis, labele, kategoria) |
| 3 | `epir-marketing-ingest/src/csv_export.ts` | CSV |
| 4 | `epir-marketing-ingest/src/r2_client.ts` | Upload R2 → public URL |
| 5 | GMC | Scheduled fetch z `config/r2.json` → `publicFeedUrl` |

**Komendy:** `cd epir-marketing-ingest` → `npm run ingest:r2` (domyślny sink).  
**Dokumentacja:** [`epir-marketing-ingest/README.md`](../../epir-marketing-ingest/README.md)

---

## 3. Kto wchodzi do feedu CSV (filtr ingest)

SSOT: [`epir-marketing-ingest/config/shopify.json`](../../epir-marketing-ingest/config/shopify.json) → `productQuery`:

```
status:active inventory_total:>0 -tag:sprzedane -tag:kazka
```

| Warunek | Zgodność z modelem sklepu |
|---------|---------------------------|
| `status:active` | Aktywny katalog |
| `inventory_total:>0` | Tylko z zapasem (nie „pusta” oferta) |
| `-tag:sprzedane` | Archiwum Inspiracji / sprzedane — **wykluczone** |
| `-tag:kazka` | Kanał Kazka (Hydrogen) — **osobny tor**, nie apex/GMC EPIR |

**Nie w filtrze ingest (ważne):** szablon PDP (`nowy-szablon`), publikacja Google & YouTube, klasyfikacja metalu — ingest bierze **wszystkie** produkty spełniające query powyżej. Dodatkowy kontrakt PMax jest w audycie (§4).

**URL produktu:** `onlineStoreUrl` lub `https://epirbizuteria.pl/products/{handle}` (`storefrontBaseUrl`).

---

## 4. Kontrakt PMax / eligibility (audyt — węższy niż ingest)

SSOT: [`scripts/audit-epir-shopping-eligibility.mjs`](../../scripts/audit-epir-shopping-eligibility.mjs) + [`scripts/lib/epir-metal-label.mjs`](../../scripts/lib/epir-metal-label.mjs)

Wszystkie warunki **łącznie**:

| Warunek | Szczegół |
|---------|----------|
| Status | `active`, `inventory_total:>0` |
| Tagi | bez `sprzedane`, bez Kazki (vendor `kazka` lub tag `kazka`) |
| Szablon PDP | `templateSuffix` = `nowy-szablon` **lub** `pierscionek-zloto-turmali` (linia złota) |
| Publikacja | Google & YouTube **i** Online Store |
| Metal | klasyfikowalny → `custom_label_2` = `Srebro` lub `Zloto` |

**Gap:** produkt może być w CSV feedu, ale **nie** w PMax listing groups, jeśli brak szablonu `nowy-szablon` / złotego szablonu lub brak publikacji GY.

---

## 5. Kolumny GMC i mapowanie

SSOT kolumn: [`epir-marketing-ingest/config/mapping.json`](../../epir-marketing-ingest/config/mapping.json)

| Kolumna GMC | Źródło / reguła |
|-------------|-----------------|
| `id` | `shopify_PL_{variantId}` |
| `title` | Reguły + opcjonalnie OpenRouter AI (`--no-ai` wyłącza) |
| `description` | HTML → plain, max 5000 znaków |
| `link` | URL produktu na apex |
| `image_link` | Obraz wariantu lub featured |
| `price` | Cena wariantu, format `PLN` |
| `availability` | Z `custom_label_1` + stan magazynu → `in stock` / `preorder` / `out of stock` |
| `brand` | `vendor` |
| `google_product_category` | Metafield GY → kolekcja → `productType` → domyślne `188` |
| `custom_label_0` | Marża (patrz §6) — lub istniejący metafield wariantu |
| `custom_label_1` | Czas wysyłki (patrz §7) — lub istniejący metafield |
| `custom_label_2` | Metal Srebro/Zloto (patrz §8) — lub istniejący metafield |

**Metafieldy produktu (ingest):** `custom.czas_dostawy`, `custom.main_stone`, `custom.metal`, `custom.design_style`, taxonomy Shopify kamień/materiał, `mm-google-shopping.*`.

**Sync labelów do Shopify (przed ingest):** `node scripts/sync-metal-custom-label-2.mjs` — ustawia `mm-google-shopping.custom_label_2` na wariantach.

---

## 6. `custom_label_0` — marża / hero

Reguły w `mapping.json` → `marginRules` (kolejność w `transform.ts`):

1. Tag: `hero`, `best-seller`, `bestseller`, `flagowy` → `Hero-Product`
2. `productType` = `Pierścionek zaręczynowy` → `Hero-Product`
3. Vendor EPIR + tag `bestseller` / `forest` → `Hero-Product`
4. Cena ≥ 2500 PLN + marża (unit cost) ≥ 55% → `High-Margin`
5. Cena ≥ 900 PLN + marża ≥ 40% → `Medium-Margin`
6. Reszta → `Low-Margin`

**Powiązanie ze sklepem:** kategorie podstawowe nie mapują się 1:1 na `custom_label_0` — to heurystyka cenowa i tagów, nie typ bransoletka/kolczyk.

---

## 7. `custom_label_1` — czas wysyłki (operator vs kod)

### Operator (handoff)

- `Wysylka_24h` **niedopuszczalne** w feedzie.
- Realne terminy: **4–7 dni** (standard); skomplikowane wyroby (np. Magiczny Ogród) **~3 tygodnie**.

### Kod (`mapping.json` → `availabilityRules`)

| Label w feedzie | Kiedy |
|-----------------|--------|
| `Wysylka_4_7_dni` | Domyślny lead time `4-7 dni`, wzorce 3–7 dni w `custom.czas_dostawy`, legacy „24h” / „od ręki”, lub fallback |
| `Na_zamowienie_7_dni` | Wzorce 7+ dni, 2–3 tygodnie, „na zamówienie”, brak stocku |

**`Wysylka_24h` usunięte** z pipeline (2026-08-11) — zgodnie z ustaleniem operatora; inventory nie nadpisuje labelu na 24h.

`availability` GMC: `Na_zamowienie_7_dni` → `preorder`; `Wysylka_4_7_dni` z stockiem → `in stock`.

---

## 8. `custom_label_2` — metal (Srebro / Zloto)

SSOT: `epir-metal-label.mjs` + `epir-marketing-ingest/src/metal-label.ts`

| Sygnał | Wynik |
|--------|--------|
| Szablon `pierscionek-zloto-turmali` | `Zloto` |
| Heurystyka tytułu (lite złoto, 14k/18k, AU585/750) | `Zloto` |
| Vendor `epir art gold` | `Zloto` |
| Vendor EPIR silver / jewellery&gemstone | `Srebro` |
| Pozłacenie, „złoty pył”, srebro w tytule | **nie** Zloto |

**Powiązanie ze sklepem:**

| Kategoria operatora | Oczekiwany `custom_label_2` |
|---------------------|----------------------------|
| BRANSOLETKI / KOLCZYKI / PIERŚCIONKI / WISIORY SREBRNE | `Srebro` |
| BIŻUTERIA ZŁOTA | `Zloto` (wymaga poprawnego szablonu / tytułu / vendora) |

PMax listing groups: **Srebro + Zloto** jako osie podziału (`marketing-ops.mjs expand-metal`).

---

## 9. `google_product_category` — typ produktu vs kategorie sklepu

Mapowanie w `mapping.json` (nie kategorie operatora 1:1):

| `productType` (Shopify) | ID kategorii Google |
|-------------------------|---------------------|
| Pierścionek | 200 |
| Naszyjnik | 196 |
| Kolczyki | 194 |
| Bransoletka | 191 |
| Obrączka | 200 |
| Domyślne | 188 |
| Kolekcja Forest / Kazka | 200 (override po kolekcji) |

**Gap:** pięć kategorii operatora (BRANSOLETKI SREBRNE, …) to **nazwy operacyjne** — w feedzie używane są `productType` Shopify i kolekcje. Uporządkowanie `productType` w Adminie albo mapowanie z kolekcji podstawowych → **otwarte** (czeka na dywagacje operatora).

---

## 10. Tytuł i opis

- **Tytuł (reguły):** bazowy tytuł + kamień + materiał + craftsmanship; suffix „ręcznie kuty rzemieślniczy” jeśli brak innych części; max 150 znaków.
- **Tytuł (AI):** OpenRouter (`OPENROUTER_API_KEY`), modele z `mapping.json`; `--no-ai` tylko reguły.
- **Opis:** plain z HTML lub szablon z metafieldów.

Intencja zakupowa w Ads (Search) — **poza feedem** (grupy reklam, suffixy UTM); feed dostarcza produkt + labele do PMax listing groups.

---

## 11. Zestawienie: sklep → feed → Ads

```
┌─────────────────────────────────────────────────────────────┐
│  SKLEP (operator)                                           │
│  5 kategorii podstawowych + NOWOŚCI (operacyjnie)           │
│  Kolekcje tematyczne = sortowanie, ten sam towar            │
│  Archiwum / sprzedane → NIE w feedzie                       │
│  Kazka → osobny kanał (Hydrogen), NIE w tym feedzie         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  INGEST CSV (epir-marketing-ingest)                         │
│  active + stock + bez sprzedane + bez kazka                 │
│  → wszystkie warianty → R2 → GMC scheduled fetch            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PMax eligibility (audyt — podzbiór)                        │
│  + szablon nowy-szablon | pierscionek-zloto-turmali         │
│  + publikacja Google & YouTube + Online Store               │
│  + custom_label_2 klasyfikowalny                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Google Ads                                                 │
│  PMax Shopping → URL produktów z feedu (nie landing host)   │
│  Listing groups po custom_label_2 (Srebro / Zloto)          │
│  Search → suffixy utm_campaign na landingach (osobny tor)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Otwarte luki (sklep ↔ feed)

| Temat | Stan |
|-------|------|
| Mapowanie 5 kategorii operatora → `productType` / kolekcje w feedzie | Nie zaimplementowane — czeka na operatora |
| NOWOŚCI jako tag/kolekcja w feedzie | Brak dedykowanego labelu; tylko ogólny filtr `active` |
| Szablon PDP vs szeroki ingest | Ingest szeroki; PMax węższy — audyt przed expand listing groups |
| BIŻUTERIA ZŁOTA bez szablonu złotego | Może być w CSV, ale fail eligibility / `custom_label_2` |

---

## 13. Prompt startowy (Cursor)

```
Czytaj docs/working/FEED_AND_STORE_STRUCTURE.md, docs/working/LANDINGS_APEX_HANDOFF.md
i epir-marketing-ingest/config/mapping.json.
Zmiany feedu: najpierw audyt eligibility, potem ingest. Bez deployu Ads bez zgody operatora.
```
