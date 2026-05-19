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

3. **Cron:** po deployzie sprawdź *Logs* pod tagiem `[MARKETING_INGEST]` — powinny pojawić się linie `GA4` / `Ads` z liczbą wierszy.

---

## 6. Częste błędy

| Objaw | Kierunek diagnostyki |
|--------|----------------------|
| GA4: HTTP 403 / permission denied | E-mail SA nie dodany w GA4 Property albo wyłączone **Google Analytics Data API** w GCP. |
| GA4: HTTP 404 / invalid property | Zły `GA4_PROPERTY_ID` (np. Measurement ID zamiast Property ID). |
| Ads: token refresh failed | Zły `GOOGLE_ADS_CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` albo scope bez `adwords`. |
| Ads: HTTP 401 / PERMISSION_DENIED | Developer token nieakceptowany albo brak `GOOGLE_ADS_LOGIN_CUSTOMER_ID` przy dostępie pod MCC. |
| Ingest: brak wierszy w Iceberg | Brak / zły `MARKETING_PIPELINE_INGEST_URL`; worker celowo **pomija** ingest, jeśli URL jest pusty (log: `MARKETING_PIPELINE_INGEST_URL not set, skip`). |

---

## 7. Deploy

```powershell
cd d:\aplikacja_epir\workers\marketing-ingest
npx wrangler deploy
```

Pełna kolejność z repo: [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).
