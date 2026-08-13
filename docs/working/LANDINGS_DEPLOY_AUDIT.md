# Procedura audytowa — landings Ads + PMax Shopping (Tor Apex)

**Status:** materiał roboczy (operator). **Data:** 2026-08-11.

## Cel

Przed i po deployu `epir-dynamic-landing-liquid` oraz zmian w `workers/analytics` — potwierdzić:

1. **PMax Shopping (`EPIR_Srebro` / `EPIR_Zloto`)** prowadzi na **PDP z feedu**, nie na home ani `l.`
2. **Search / editorial** używa `l.epirbizuteria.pl` z UTM — z linkami do PDP z zachowaniem atrybucji
3. **Ruch subdomen** jest widoczny w **EPIR pixel (D1)** i opcjonalnie **GA4** (ten sam property + linker)
4. **Feed GMC** odzwierciedla stock po operacjach operatora (`sprzedane`, restore stock)

## Role

| Krok | Wykonawca | Artefakt |
|------|-----------|----------|
| A1–A4 | Agent / operator | logi komend, JSON audytu |
| B1–B2 | Operator (Ads UI) | screenshot / notatka kampanii |
| C1 | Operator (GA4 Admin) | Measurement ID w Worker vars |

---

## A. Automatyczny audyt (repo)

### A1. Eligibility PMax / feed

```bash
node scripts/audit-epir-shopping-eligibility.mjs
node scripts/audit-epir-shopping-eligibility.mjs --json .tmp/shopping-audit-now.json
```

**PASS gdy:**

- `pmaxEligible` ≥ oczekiwana liczba apex+stock (po restore ~14 SKU)
- Brak produktów z tagiem `sprzedane` w eligible
- `custom_label_2` = `Srebro` lub `Zloto` dla wszystkich eligible

### A2. Listing groups PMax

```bash
node scripts/marketing-ops.mjs audit --campaign Epir_Forest-Dark
```

**PASS gdy:**

- Grupa `EPIR_Srebro` filtruje `custom_label_2 = Srebro` (bez Kazki)
- **Brak** final URL na home dla asset group Shopping — URL produktu = `https://epirbizuteria.pl/products/{handle}` z feedu

### A3. Testy workera landings

```bash
cd workers/dynamic-landing-liquid && npx vitest run
```

**PASS:** wszystkie testy zielone.

### A4. Ingest feed → R2 (po zmianach stock/tagów)

```bash
cd epir-marketing-ingest && npm run ingest:r2
```

**PASS:** `gmc_feed.csv` w R2 zaktualizowany; GMC scheduled fetch w ciągu 24h (lub ręczny fetch w GMC).

---

## B. Weryfikacja kampanii (operator)

### B1. PMax — best practice Shopping → PDP

| Element | Ustawienie kanoniczne |
|---------|----------------------|
| Typ asset group | **Shopping** (produkty z feedu) |
| Final URL expansion | **Wyłączone** dla ścieżek na home |
| URL produktu | Z feedu GMC: `link` = apex PDP |
| `l.epirbizuteria.pl` | **Tylko Search** (`utm_campaign`: `organic_art`, `forest_premium`, `artisan_rings`, `artisan_gold`) — **nie** PMax Shopping |

**Dlaczego:** PMax Shopping nie ma „landing page” — Google używa `link` z feedu. To standard branżowy dla SKU z stockiem; editorial na `l.` to warstwa Search / brand, nie Shopping.

### B2. Search final URLs (gdy landings ON)

Przykłady:

- `https://l.epirbizuteria.pl/?utm_campaign=forest_premium&utm_source=google&utm_medium=cpc`
- `https://l.epirbizuteria.pl/?utm_campaign=organic_art&utm_source=google&utm_medium=cpc`

Klik w produkt na landingu → PDP apex z **tym samym** `utm_*` / `gclid` (skrypt landingu + GA linker).

---

## C. Śledzenie (post-deploy)

### C1. GA4

1. W Cloudflare Dashboard → Worker `epir-dynamic-landing-liquid` → Variables (już w `wrangler.toml`):
   - `GA4_MEASUREMENT_ID` = `G-RXRHQDWF4K`
   - `GTM_CONTAINER_ID` = `GTM-NQZ5QCG`
   - `GOOGLE_ADS_TAG_ID` = `AW-17821070797`
2. W GA4 Admin → Data streams → Web → **Configure your domains** → dodaj `l.epirbizuteria.pl` + cross-domain z `epirbizuteria.pl`.

### C2. EPIR pixel

1. `workers/analytics` — `ALLOWED_ORIGINS` zawiera `https://l.epirbizuteria.pl`
2. Po wejściu na landing (test z `utm_source=test`):

```bash
# po deploy analytics — podgląd ostatnich eventów (operator panel / D1)
```

**PASS:** w `pixel_events` wiersz `page_viewed`, `channel = ads-landing`, `traffic_source` z UTM.

### C3. Smoke URL

```text
https://l.epirbizuteria.pl/?utm_campaign=forest_premium&utm_source=audit&utm_medium=test
```

Oczekiwane nagłówki odpowiedzi: `X-EPIR-Landing-Mode: standalone`, HTML z sekcjami `#atelier-3d`, `#warsztat`, `#kolekcje`.

---

## D. Deploy (po PASS A1–A3)

```bash
cd workers/analytics && npx wrangler deploy
cd ../dynamic-landing-liquid && npx wrangler deploy
```

**Rollback:** `LANDINGS_ENABLED = "false"` w `wrangler.toml` + deploy — ruch `l.` → redirect na pierwszy produkt kuracji (nie home).

---

## E. Checklist operatora (podpis)

- [ ] A1 PASS — liczba eligible + JSON zapisany
- [ ] A2 PASS — PMax Srebro/Zloto bez home URL
- [ ] A3 PASS — vitest
- [ ] A4 PASS — ingest R2
- [ ] B1 potwierdzone w Ads UI
- [ ] C1 GA4 Measurement ID ustawiony (jeśli wymagany)
- [ ] C2 pixel `ads-landing` w D1
- [ ] D deploy wykonany

**Uwaga:** W repo i docs **nie** umieszczamy nazw zewnętrznych marek wzorcowych — tylko wewnętrzne klucze kampanii EPIR.
