# epir_analityc (public)

**Publiczne repo:** [github.com/EPIRjewelry/epir_analityc](https://github.com/EPIRjewelry/epir_analityc) — kod usługi Project B: Worker [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) (`routeAgentRequest`, Durable Object `Agent`, `@callable`). Nie zawiera sekretów GA4/Google Ads; woła wyłącznie HTTP `epir-marketing-ingest` (`GET /ops/marketing-preview`).

**Kanoniczne źródło prawdy** (dokumentacja, kontrakty danych, reszta systemu): [github.com/EPIRjewelry/aplikacja_epir](https://github.com/EPIRjewelry/aplikacja_epir). Plan izolacji `agents` od workspaces monorepo: [EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md](https://github.com/EPIRjewelry/aplikacja_epir/blob/main/docs/EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md).

Ten katalog w monorepo jest **lustrem źródła** tego repozytorium (kopiowany root); rozwój można prowadzić tu albo wyłącznie na GitHubie — unikaj rozjazdu bez `git pull` / PR.

## Konfiguracja

1. `npm install` w root tego repo.
2. Ustaw `MARKETING_INGEST_ORIGIN` w `wrangler.toml` → `[vars]` albo w dashboardzie (tylko origin, np. `https://…workers.dev`).
3. `npx wrangler secret put MARKETING_OPS_BEARER_TOKEN` — ta sama semantyka co `MARKETING_OPS_PREVIEW_KEY` na workerze `epir-marketing-ingest`.
4. Opcjonalnie `npx wrangler secret put OPENROUTER_API_KEY` — callable `listModels()` (katalog modeli); analityka danych nadal przez `epir-marketing-ingest` / warehouse RPC, nie przez LLM.
5. `npm run deploy` lub `npx wrangler deploy`.

## Routing agenta

Zgodnie z dokumentacją Cloudflare: `/agents/{kebab-class}/{instance}` — np. `/agents/marketing-sidecar-agent/moja-sesja/…` (callable RPC przez SDK).

## Health

`GET /healthz` — JSON `{ "ok": true, "service": "epir_analityc" }`.

## Zgodność z narzędziami

- **Node:** upstream `@rolldown/plugin-babel` zgłasza ostrzeżenie poniżej Node 22 — rozważ Node 22 LTS dla dev/deploy.
- **Bundler:** Zod 4 publikuje podścieżki ESM wskazujące na brakujące `.js`; w `wrangler.toml` są **`[alias]`** na pliki `.cjs`. Szczegóły: [plan w monorepo](https://github.com/EPIRjewelry/aplikacja_epir/blob/main/docs/EPIR_CLOUDFLARE_AGENT_SERVICE_PLAN.md).

## Produkcja

Host workera chronij **Cloudflare Access** lub VPN; sekrety tylko w Cloudflare Secrets.
