# epir-marketing-ingest

Pipeline feedu produktowego **Shopify Admin API → R2 / CSV → Google Merchant Center (GMC)** dla kampanii Performance Max.

> **Uwaga o nazwie:** Ten katalog to **lokalny pipeline feedu GMC**. Nie mylić z workerem Cloudflare [`workers/marketing-ingest`](../workers/marketing-ingest/README.md) (GA4 + Google Ads → Iceberg).

## Kontekst w repo EPIR

| Komponent | Rola |
|-----------|------|
| `epir-marketing-ingest` (ten katalog) | Feed produktowy: Shopify → **R2 public URL** / CSV → GMC |
| `workers/marketing-ingest` | Ingest GA4/Ads → Pipelines/Iceberg; ops PMax listing groups |
| `workers/marketing-ingest/src/pmax-listing.ts` | Audyt/expand listing groups PMax (`Epir_Forest-Dark`, exclude Kazka) |

**Google Sheets** — kod zachowany jako **legacy** (`sheets_client.ts`, `sheets_sink.legacy.ts`), domyślnie **wyłączony** (`config/output.json` → `sheetsEnabled: false`).

## Szybki start

```powershell
cd d:\aplikacja_epir\epir-marketing-ingest
npm install
# Shopify: auto z repo root .dev.vars (SHOPIFY_ADMIN_TOKEN + SHOP)
npm run ingest:dry     # podgląd
npm run ingest:csv     # tylko CSV lokalnie
npm run ingest:r2      # CSV + upload R2 (domyślny ingest)
npm run ingest         # to samo co ingest:r2
```

## R2 + GMC Scheduled fetch (docelowy sink)

1. Utwórz bucket: `npx wrangler r2 bucket create epir-gmc-feed`
2. Włącz **publiczny dostęp** do obiektu (R2 → bucket → Settings → Public access / `r2.dev` URL)
3. Uzupełnij `config/r2.json`:
   - `bucket`: `epir-gmc-feed`
   - `objectKey`: `gmc_feed.csv`
   - `publicFeedUrl`: URL z R2 (np. `https://pub-xxxx.r2.dev/gmc_feed.csv`)
4. `npx wrangler login` (sesja do uploadu)
5. `npm run ingest:r2`
6. W **Merchant Center** → Feeds → **Scheduled fetch** → URL z `publicFeedUrl`

## Zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `SHOPIFY_ADMIN_TOKEN` | Auto z root `.dev.vars` (custom app `epir_ai`) |
| `SHOP` | Auto z `.dev.vars` |
| `R2_BUCKET_NAME` | *(opcjonalnie)* nadpisuje `config/r2.json` |
| `R2_PUBLIC_FEED_URL` | *(opcjonalnie)* publiczny URL feedu dla GMC |
| `OPENROUTER_API_KEY` | *(opcjonalnie)* AI tytuły |
| `OPENROUTER_MODELS` | np. `moonshotai/kimi-k3,x-ai/grok-4.5` |

### Google Sheets (legacy — wyłączone)

Re-włączenie: `config/output.json` → `"sheetsEnabled": true`, credentials GCP, `npm run ingest -- --sheets`.

## Struktura projektu

```
epir-marketing-ingest/
  config/
    shopify.json, mapping.json, output.json, r2.json
    sheets.json          # legacy
  src/
    shopify_client.ts, transform.ts, runner.ts
    r2_client.ts         # upload Wrangler → R2
    sheets_client.ts     # legacy
    sheets_sink.legacy.ts
```

## Flagi CLI

| Flaga | Efekt |
|-------|--------|
| `--no-ai` | Tylko reguły (bez OpenRouter) |
| `--dry-run` | Bez zapisu |
| `--csv=auto` | Tylko lokalny CSV |
| `--r2` | Upload do R2 (+ CSV jeśli `localCsvBackup: true`) |
| `--sheets` | Legacy Sheets (wymaga `sheetsEnabled: true`) |

## Governance

- Sekrety nie commituj.
- Sheets / GCP **nie** jest wymagany do działania feedu.
- SSOT analityki: D1 → Iceberg (nie ten pipeline).
