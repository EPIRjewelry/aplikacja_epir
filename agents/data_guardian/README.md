# EDOG Data Guardian — Cursor SDK orchestrator (Local Runtime)

Programistyczny orkiestrator audytu przepływu danych EPIR (NB-01 / Opcja C): dwa subagenty **lokalne** w `Promise.all`, MCP `epir-data-ops`, deterministyczna bramka z `GET /internal/flow-health`.

## Wymagane zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `CURSOR_API_KEY` | Klucz API Cursor ([Integrations](https://cursor.com/dashboard/integrations)) |
| `CLOUDFLARE_ACCOUNT_ID` | Konto Cloudflare (D1 read) |
| `CLOUDFLARE_API_TOKEN` | Token z uprawnieniem D1 Read |
| `EPIR_BATCH_WORKER_ORIGIN` | URL workera batch — **Twoje konto:** `https://epir-bigquery-batch.krzysztofdzugaj.workers.dev` (wzorzec: `https://epir-bigquery-batch.<subdomena-workers>.workers.dev`; subdomena ≠ ta sama co `chat.epir-art-silver-jewellery…`) |
| `DATA_GUARDIAN_OPS_KEY` | Bearer — ten sam secret co na workerze |

Opcjonalnie:

| Zmienna | Opis |
|---------|------|
| `EPIR_REPO_ROOT` | Root monorepo (domyślnie: dwa poziomy nad tym katalogiem) |
| `EDOG_AUDITOR_MODEL_ID` | Pin modelu (domyślnie: auto z `Cursor.models.list()`, fallback `claude-4-sonnet`) |
| `EPIR_ANALYST_WORKER_ORIGIN` | Dla `warehouse_probe` w MCP |
| `ANALYST_HTTP_BEARER` | Bearer analyst-worker |

## Instalacja i uruchomienie

1. Skopiuj [`.env.example`](.env.example) → `.env` i uzupełnij `CURSOR_API_KEY`, `CLOUDFLARE_API_TOKEN`, `DATA_GUARDIAN_OPS_KEY`.
2. Smoke origin (bez klucza → 401 `unauthorized` = URL OK):

   ```powershell
   curl https://epir-bigquery-batch.krzysztofdzugaj.workers.dev/internal/flow-health
   ```

Z roota repozytorium (lub z tego katalogu):

```powershell
cd agents/data_guardian
npm install --no-audit --no-fund
npm run audit
```

Wynik: [`audit_report.json`](audit_report.json) z polem `gate_signature`: `EDOG: PASS` lub `EDOG: FAIL`.

Exit code: `0` = PASS, `1` = FAIL lub błąd startu.

## Po audycie (pętla remediacji)

EDOG **nie naprawia sam** — przy `EDOG: FAIL` identyfikuje `reasons[]`, zleca naprawę (EFA / deploy / operator), odbiera `remediation_report`, ponawia `npm run audit` aż `gate_signature` i `edog_verdict` = **PASS** → wtedy **END**. Szczegóły: [`.cursor/rules/epir-edog-guardian.mdc`](../../.cursor/rules/epir-edog-guardian.mdc).

## Model (Claude Sonnet)

Przed pierwszym cronem ustaw pin po liście modeli:

```typescript
import { Cursor } from "@cursor/sdk";
const models = await Cursor.models.list({ apiKey: process.env.CURSOR_API_KEY! });
console.log(models.filter(m => /sonnet/i.test(m.displayName)));
```

Ustaw `EDOG_AUDITOR_MODEL_ID` na `id` zwrócony przez API.

## Cursor Automations (No-repo, cron co 1 h)

1. **Cursor → Automations → New automation**
2. **Trigger:** Cron `0 * * * *` (co godzinę, UTC)
3. **Action:** Run shell command (host musi być włączony — Local Runtime):

   ```powershell
   cd D:\aplikacja_epir\agents\data_guardian
   npm run audit
   ```

4. Ustaw zmienne env w profilu użytkownika / sekretach automatyzacji (te same co w tabeli powyżej).
5. **MCP Tool Protection:** jednorazowo zatwierdź narzędzia `epir-data-ops` w Cursor IDE; automatyzacja dziedziczy zapisane logowanie MCP tam, gdzie platforma to wspiera.

### `DATA_GUARDIAN_OPS_KEY` — skąd wziąć?

To **losowy Bearer**, który **Ty** zapisałeś przy:

```powershell
cd workers/bigquery-batch
npx wrangler secret put DATA_GUARDIAN_OPS_KEY
```

Cloudflare **nie pozwala odczytać** wartości sekretu z powrotem. Jeśli nie pamiętasz klucza:

```powershell
# wygeneruj nowy (PowerShell)
$k = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
$k
npx wrangler secret put DATA_GUARDIAN_OPS_KEY
# wklej ten sam $k w .env jako DATA_GUARDIAN_OPS_KEY
```

Ten sam klucz musi być w `.env` / MCP i w nagłówku `Authorization: Bearer …` przy `flow-health`.

### `CURSOR_API_KEY` — skąd wziąć?

1. Zaloguj się na [cursor.com](https://cursor.com).
2. **Dashboard → Integrations** (lub **Settings → API**).
3. **Create API key** / **User API key** — skopiuj wartość zaczynającą się od `cursor_…`.
4. Wklej do `.env` jako `CURSOR_API_KEY` (nie commituj).

Team: alternatywnie **Service account** w Team Settings — tylko jeśli używasz konta zespołowego.

Ten skrypt **uzupełnia** cron EDOG na workerze (2×/dobę, krok 5 w [`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../../docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md)) — nie zastępuje go.

## Reguły i skill

- Reguła Cursor: [`.cursor/rules/epir-edog-guardian.mdc`](../../.cursor/rules/epir-edog-guardian.mdc)
- Skill: [`.cursor/skills/epir-edog-agent/SKILL.md`](../../.cursor/skills/epir-edog-agent/SKILL.md)

## DAG

```text
dataFlowAuditor (MCP epir-data-ops)  ─┐
                                      ├─► aggregate → audit_report.json
typeValidator (tsc + CQRS types)     ─┘
         +
fetchFlowHealth (HTTP, deterministyczna bramka)
```

`DEGRADED` z API → `EDOG: FAIL` w `gate_signature`.
