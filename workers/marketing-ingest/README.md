# `epir-marketing-ingest`

Worker **pulluje** dane marketingowe z **Google Analytics 4 (Data API)** oraz **Google Ads (Search API / GAQL)** i wysyła **agregaty** na HTTP ingest Cloudflare Pipelines → Iceberg (namespace `marketing`, ten sam bucket co hurtownia pixeli).

Szerszy kontekst deployu: [`docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`](../../docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md) (sekcja `workers/marketing-ingest`).

---

## 1. Zmienne środowiskowe — mapowanie

| Źródło | Zmienna | Gdzie ustawić | Uwagi |
|--------|---------|---------------|--------|
| GA4 | `GA4_PROPERTY_ID` | `[vars]` w `wrangler.toml` lub Dashboard **Variables** | **Numeryczne** Property ID z GA4 → *Admin* → *Property settings* (np. `435783047`). **Nie** używaj Measurement ID (`G-…`). Dozwolony też format `properties/123456789`. |
| GA4 | `GA4_SERVICE_ACCOUNT_JSON` | **Secret** (`wrangler secret put`) | Cały plik JSON konta usługi (jedna linia albo wklej przez stdin — patrz §4). |
| Google Ads | `GOOGLE_ADS_CLIENT_ID` | **Variable** (nie-sekret) lub `.dev.vars` | OAuth 2.0 Client ID (typ *Desktop* lub *Web* w Google Cloud Console). |
| Google Ads | `GOOGLE_ADS_CLIENT_SECRET` | **Secret** | OAuth client secret. |
| Google Ads | `GOOGLE_ADS_REFRESH_TOKEN` | **Secret** | Refresh token użytkownika z dostępem do konta Ads (§3). |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN` | **Secret** | Token z Google Ads → *Tools & settings* → *API Center*. |
| Google Ads | `GOOGLE_ADS_CUSTOMER_ID` | **Variable** | **10 cyfr bez myślników** (CID konta reklamowego). |
| Google Ads | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | **Secret** (opcjonalnie) | Tylko przy dostępie **przez MCC**: CID menedżera, bez myślników → nagłówek `login-customer-id`. |
| Pipelines | `MARKETING_PIPELINE_INGEST_URL` | **Secret** | URL HTTP ingest streamu marketingowego. |
| Pipelines | `MARKETING_PIPELINE_INGEST_TOKEN` | **Secret** (opcjonalnie) | Jeśli ingest wymaga `Authorization: Bearer …`. |
| Ops | `MARKETING_OPS_PREVIEW_KEY` | **Secret** (opcjonalnie) | Bearer do `GET /ops/marketing-preview` i tras DO `/ops/marketing-analyst/*`. |
| Shopify | `SHOPIFY_ADMIN_TOKEN` | **Secret** | Admin API — pull klientów do Customer Match (`/ops/customer-match-sync`). Ten sam token co w root `.dev.vars`. |
| Shopify | `SHOP` | **Variable** lub secret | Host sklepu, np. `epir-art-silver-jewellery.myshopify.com`. |

Lokalnie: skopiuj [`.dev.vars.example`](./.dev.vars.example) → `.dev.vars` (plik jest ignorowany przez git).

---

## 2. Google Analytics 4 (service account)

1. **Google Cloud Console** (projekt powiązany z GA4 lub dowolny, w którym tworzysz SA):
   - *APIs & Services* → *Library* → włącz **Google Analytics Data API**.
2. *IAM & Admin* → *Service Accounts* → *Create* → pobierz klucz **JSON**.
3. **Google Analytics** → *Admin* → właściwa **Property** → *Property access management* → **Add users** → wklej **e-mail konta usługi** (z pola `client_email` w JSON) z rolą co najmniej **Viewer** (wystarczy do `runReport` read-only).
4. Skopiuj **Property ID** (same cyfry w *Property settings*) do `GA4_PROPERTY_ID`.

Scope używany w kodzie: `https://www.googleapis.com/auth/analytics.readonly`.

---

## 3. Google Ads (OAuth refresh + developer token)

1. W **Google Ads** (*Tools & settings* → *API Center*) uzyskaj **developer token** (poziom *Test* działa na kontach testowych; produkcja wymaga zatwierdzenia *Basic* / *Standard* według polityki Google).
2. **Google Cloud Console** — ten sam lub osobny projekt:
   - Włącz **Google Ads API**.
   - *Credentials* → *Create credentials* → **OAuth client ID** (np. *Desktop app*).
3. OAuth **refresh token** (jednorazowo, poza Workerem):
   - [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) → *OAuth 2.0 configuration* → zaznacz **Use your own OAuth credentials** → wklej Client ID i Secret.
   - W kolumnie *Select & authorize APIs* wybierz scope **`https://www.googleapis.com/auth/adwords`** (lub wpisz ręcznie).
   - *Authorize APIs* → zaloguj się kontem z dostępem do **docelowego** konta Ads → *Exchange authorization code for tokens* → skopiuj **Refresh token**.
4. **Customer ID** konta, z którego pobierane są kampanie: *Google Ads* → górny pasek (format `123-456-7890`) → zapisz jako **same cyfry** w `GOOGLE_ADS_CUSTOMER_ID`.
5. Jeśli API wołasz **w imieniu klienta pod MCC**: ustaw `GOOGLE_ADS_LOGIN_CUSTOMER_ID` na CID **menedżera** (bez myślników).

Kod woła `googleads.googleapis.com/v17/.../googleAds:search` z GAQL z filtrem `segments.date` (dane dzienne).

---

## 4. Cloudflare — ustawianie sekretów (PowerShell)

Z katalogu workera (po `wrangler login`):

```powershell
cd d:\aplikacja_epir\workers\marketing-ingest
```

**GA4 JSON** (wieloliniowy — wklej całość, zakończ pustą linią lub Ctrl+Z Enter w CMD):

```powershell
npx wrangler secret put GA4_SERVICE_ACCOUNT_JSON
```

**Pozostałe sekrety** (krótkie wartości):

```powershell
npx wrangler secret put GOOGLE_ADS_CLIENT_SECRET
npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN
npx wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN
npx wrangler secret put MARKETING_PIPELINE_INGEST_URL
npx wrangler secret put MARKETING_PIPELINE_INGEST_TOKEN   # opcjonalnie, jeśli używasz Bearer na ingest
npx wrangler secret put MARKETING_OPS_PREVIEW_KEY        # opcjonalnie — preview / analyst DO
npx wrangler secret put GOOGLE_ADS_LOGIN_CUSTOMER_ID     # opcjonalnie — MCC
```

**Zmienne nie-sekretne** (`GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CUSTOMER_ID`) ustaw w **Cloudflare Dashboard** → Worker `epir-marketing-ingest` → **Settings** → **Variables** (plaintext), albo dopisz je do `[vars]` w `wrangler.toml` i zrób deploy (nie wklejaj sekretów do pliku — tylko ID klienta OAuth i numeryczne CID są dopuszczalne według polityki repo).

Jeśli deployujesz z innym środowiskiem Wrangler (`--env production` itd.), przy `secret put` użyj tego samego `--env …`.

## 5. Weryfikacja

1. **Health:** `GET https://<worker-host>/healthz` (lub ścieżka z custom domain po podpięciu).
2. **Preview (wymaga `MARKETING_OPS_PREVIEW_KEY`):**

   ```powershell
   curl.exe -s -H "Authorization: Bearer YOUR_PREVIEW_KEY" "https://<worker-host>/ops/marketing-preview?date=2026-01-15"
   ```

   Oczekujesz JSON z polami zawierającymi wiersze GA4 i Ads (puste tablice, jeśli dany dzień nie ma danych lub brakuje uprawnień — wtedy sprawdź logi workera w Dashboard).

3. **PMax / Search UTM ops** (ten sam Bearer; wymaga ważnego `GOOGLE_ADS_REFRESH_TOKEN`):

   **Skrót lokalny** (root `.dev.vars`: `MARKETING_INGEST_ORIGIN` + `MARKETING_OPS_PREVIEW_KEY`):

   ```bash
   node scripts/marketing-ops.mjs audit
   node scripts/marketing-ops.mjs expand --dry-run
   node scripts/marketing-ops.mjs expand-metal --asset-group "Grupa plików 1" --metal Srebro --dry-run
   node scripts/marketing-ops.mjs expand-metal --asset-group EPIR_Zloto --metal Zloto --dry-run
   node scripts/marketing-ops.mjs asset-group-status --asset-group Walentynki --status PAUSED --dry-run
   node scripts/marketing-ops.mjs forest-utm --dry-run
   node scripts/marketing-ops.mjs search-utm --dry-run
   node scripts/marketing-ops.mjs search-themes audit --asset-group "Grupa plików 1"
   node scripts/marketing-ops.mjs search-themes apply --asset-group "Grupa plików 1" --dry-run
   node scripts/marketing-ops.mjs search-themes apply --asset-group EPIR_Zloto --dry-run
   node scripts/marketing-ops.mjs search-terms --days 14
   node scripts/marketing-ops.mjs search-negatives audit
   node scripts/marketing-ops.mjs search-negatives apply --dry-run
   node scripts/marketing-ops.mjs customer-match sync --dry-run
   node scripts/marketing-ops.mjs audience-signals audit --asset-group EPIR_Srebro
   node scripts/marketing-ops.mjs audience-signals apply --asset-group EPIR_Srebro --dry-run
   ```

   **Customer Match (Shopify → listy CRM → sygnały PMax):**

   1. Jednorazowo (scope `datamanager` na refresh token): `node scripts/ads-oauth-refresh.mjs --push-worker`
   2. Sekrety Shopify na worker: `node scripts/sync-marketing-worker-secrets.mjs`
   3. `node scripts/marketing-ops.mjs customer-match sync --dry-run` → bez `--dry-run` po weryfikacji
   4. Sygnały: `audience-signals apply --asset-group EPIR_Srebro` (jedna składana Audience per AG)

   | Ścieżka | Opis |
   |---------|------|
   | `GET /ops/pmax-listing-audit?campaign=Epir_Forest-Dark` | Audyt listing groups |
   | `GET /ops/pmax-listing-expand?dryRun=1` | Dry-run dual-metal (legacy) |
   | `GET /ops/pmax-listing-expand?dryRun=0` | Wykonaj dual-metal (legacy) |
   | `GET /ops/pmax-listing-expand-metal?assetGroup=EPIR_Srebro&metal=Srebro&dryRun=1` | Listing single-metal per AG |
   | `GET /ops/pmax-asset-group-status?assetGroup=Walentynki&status=PAUSED&dryRun=1` | Pause / enable asset group |
   | `GET /ops/pmax-forest-utm?dryRun=0` | UTM `forest_premium` |
   | `GET /ops/search-utm-suffixes?dryRun=0` | UTM per ad group Search |
   | `GET /ops/pmax-search-themes-audit?assetGroup=EPIR_Srebro` | Audyt Search Themes per AG |
   | `GET /ops/pmax-search-themes-apply?assetGroup=EPIR_Srebro&dryRun=1` | Plan zmian Search Themes |
   | `GET /ops/pmax-search-themes-apply?assetGroup=EPIR_Zloto&dryRun=0` | Apply Search Themes (HITL) |
   | `GET /ops/search-terms-audit?days=14&campaign=…` | Audyt fraz wyszukiwania (read-only) |
   | `GET /ops/search-negatives-audit` | Audyt negatywów Search |
   | `GET /ops/search-negatives-apply?dryRun=0` | Dodaj brakujące negatywy z blocklisty |
   | `POST /ops/customer-match-sync` | Shopify → segmenty CRM → Data Manager ingest |
   | `GET /ops/pmax-audience-signals-audit?assetGroup=EPIR_Srebro` | Audyt sygnałów odbiorców |
   | `GET /ops/pmax-audience-signals-apply?assetGroup=EPIR_Srebro&dryRun=0` | Podłącz składaną Audience CRM |

   RPC (bez Bearer, między workerami): `MarketingIngestS2SRpc.auditPmaxListingGroups` / `expandPmaxListingGroups` / `expandPmaxListingGroupsSingleMetal` / `setAssetGroupStatus` / `auditPmaxSearchThemes` / `applyPmaxSearchThemes` / `auditSearchTerms` / `auditSearchNegatives` / `applySearchNegatives` / `setForestPremiumCampaignSuffix` / `applySearchAdGroupUtmSuffixes`.

   Kontrakt Search Themes (allowlist per AG Srebro/Złoto): [`src/pmax-search-themes-config.ts`](src/pmax-search-themes-config.ts).

   **Migracja Srebro + Złoto (kolejność HITL):**
   1. `asset-group-status --asset-group Walentynki --status PAUSED` — jeśli AG już `REMOVED`, pause zbędny
   2. W UI: utwórz **EPIR_Zloto** (klon kreacji z Srebro), rename **Grupa plików 1** → **EPIR_Srebro**
   3. `expand-metal` Srebro + Zloto (dry-run → live)
   4. `search-themes apply` per AG (dry-run → live)

   **Blokada 2026-08-08:** Ads OAuth zwraca `invalid_grant` — odśwież `GOOGLE_ADS_REFRESH_TOKEN` (patrz §6), potem wywołaj expand + UTM.

4. **Cron:** po deployzie sprawdź *Logs* pod tagiem `[MARKETING_INGEST]` — powinny pojawić się linie `GA4` / `Ads` z liczbą wierszy.

### PMax listing groups — fallback UI (gdy API niedostępne)

1. Google Ads → **Epir_Forest-Dark** → Asset group → **Listing groups**
2. Usuń wąskie UNIT_INCLUDED po item ID / typach
3. Subdivision by **Brand**: **Kazka** → Excluded; **Everything else** → Subdivision by **Custom label 2**:
   - **Srebro** → Included
   - **Zloto** → Included
   - **Everything else** → Excluded
4. Kampania → Settings → **Final URL suffix**: `utm_source=google&utm_medium=cpc&utm_campaign=forest_premium`
5. Final URL Ads: `https://l.epirbizuteria.pl/` (host landingu Worker; nie apex)

**Kontrakt feedu (Shopify → GMC):** `status:active`, stock > 0, bez `sprzedane`/Kazka, `templateSuffix` = `nowy-szablon` **lub** `pierscionek-zloto-turmali` (złoto), kanały **Online Store** + **Google & YouTube**, `custom_label_2` = `Srebro`|`Zloto` (`scripts/sync-metal-custom-label-2.mjs`, `scripts/audit-epir-shopping-eligibility.mjs`).

---

## 6. Częste błędy

| Objaw | Kierunek diagnostyki |
|--------|----------------------|
| GA4: HTTP 403 / permission denied | E-mail SA nie dodany w GA4 Property albo wyłączone **Google Analytics Data API** w GCP. |
| GA4: HTTP 404 / invalid property | Zły `GA4_PROPERTY_ID` (np. Measurement ID zamiast Property ID). |
| Ads: token refresh failed / `invalid_grant` | Odśwież OAuth: Playground scope `adwords` → nowy refresh → `npx wrangler secret put GOOGLE_ADS_REFRESH_TOKEN`. Sprawdź zgodność Client ID/Secret. |
| Ads: HTTP 401 / PERMISSION_DENIED | Developer token nieakceptowany albo brak `GOOGLE_ADS_LOGIN_CUSTOMER_ID` przy dostępie pod MCC. |
| Ingest: brak wierszy w Iceberg | Brak / zły `MARKETING_PIPELINE_INGEST_URL`; worker celowo **pomija** ingest, jeśli URL jest pusty (log: `MARKETING_PIPELINE_INGEST_URL not set, skip`). |

---

## 7. Deploy

```powershell
cd d:\aplikacja_epir\workers\marketing-ingest
npx wrangler deploy
```

Pełna kolejność z repo: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
