# epir-sklep-bot — czysty start (dzień 1)

Nowe monorepo Gemma (Shopify + Cloudflare). **Nie** jest refaktorem `aplikacja_epir`.

## Ten folder = korzeń nowego repozytorium

Cloud Agent pracuje w workspace starego `aplikacja_epir`, więc drzewo leży tu jako `epir-sklep-bot/`. Docelowo: osobny remote GitHub (osobne repo). Zero kopiowania starych workerów / legacy `/api/mcp` / Operator Studio.

## Day 1 (START)

| Ścieżka | Rola |
|---|---|
| `apps/sklep-bot/` | Jedna app Shopify |
| `extensions/chat/` | Theme App Extension (`type = "theme"`), embed `target = body` |
| `extensions/web-pixel/` | Web Pixel (`type = "web_pixel_extension"`) — **nie** TAE |
| `workers/gemma/` | Agents SDK + Vitest lokalny |

Później (nie day 1): Steward, Marketing, packages, Hydrogen/themes.

## STOP+Pozwalam

- Zero `shopify app deploy`, zero Workers Builds produkcyjnych, zero sekretów w repo.
- Zero zmian w żywym sklepie / motywie bez osobnego pozwolenia.
- CLI scaffold (`shopify app generate`, `npm create cloudflare`) — **nie** uruchamiać bez OK Krzysztofa.
- Dual PASS smoke Ask/Order = Cień + Zastępca (faza 0) — ten szkielet smoke'u żywego sklepu **nie** robi.

## Lokalnie (bez sieci sklepu)

```bash
cd epir-sklep-bot
# Day-1 smoke (zero deps zewnętrznych — node:test):
node --experimental-strip-types --test workers/gemma/test/smoke.node.test.mjs

# Pełny Vitest + oficjalne `agents` — gdy registry.npmjs.org dostępne:
npm install --legacy-peer-deps --no-audit --no-fund
npm run test:vitest -w @epir/gemma
```

`packages/agents-day1-shim` = tymczasowy shim API (`Agent`, `routeAgentRequest`). Nie deployować. Po instalacji oficjalnego `agents` z npm — usunąć shim.

## Architektura

Wiążąca: v2 / CANONICAL z START 2026-10-30 (Werdykt Cienia: WARUNKOWY).
