# Plan: warstwa „agent jako usługa” (Cloudflare Agents SDK) obok `aplikacja_epir`

**Status:** materiał roboczy — wymaga bramki **ESOG** przed wdrożeniem produkcyjnym i przed traktowaniem jako obowiązujący kompas operacyjny.

## 1. Cel i odpowiedzialność

- Udostępnić **zewnętrzny** Worker oparty o **Cloudflare Agents SDK** (`agents`, `routeAgentRequest`, stan SQLite w DO, `@callable`, WebSocket tam gdzie ma sens), który **nie duplikuje** sekretów GA4/Ads ani logiki ingestu — tylko **wywołuje istniejące** endpointy EPIR (`epir-marketing-ingest`, opcjonalnie `epir-analyst-worker`) po HTTPS z **Bearer** trzymanym wyłącznie w sekretach Cloudflare tej usługi.
- **Jeden kanon danych i kontraktów** pozostaje w `EPIRjewelry/aplikacja_epir` i w dokumentach wymienionych w `docs/README.md`. Nowe repo to **adjacent service** (kod + deploy), nie drugi zestaw prawdy o schematach BigQuery ani o politykach MCP.
- **Repozytorium źródłowe agenta**, jeśli jest **niezależne** od tego monorepo, musi być **publiczne** na GitHubie (wymóg właściciela) — bez sekretów, z `.env.example` / listą nazw sekretów Wranglera.

## 2. Dlaczego osobny projekt (nie `workspaces` w `aplikacja_epir`)

- W monorepo **nie** wpinamy pakietu `agents` do root `workspaces` dopóki łańcuch `agents` → MCP → `zod-to-json-schema` / `zod` nie jest **kompatybilny** z wymuszonym przez Wrangler 4 / Miniflare zestawem zależności (historyczny konflikt `zod/v3` vs Zod 4 w hoście). Izolacja: **osobny katalog z własnym `package-lock.json`** (poza `workers/*`, `apps/*`, …) albo **osobne publiczne repo** — oba spełniają ten sam cel techniczny.

**Ustalenie ze szkieletu `epir-marketing-agent-service/` (2026-05):** przy `agents@0.12.4` i `zod@4.4.x` bundler Wranglera wymaga jawnych aliasów w `wrangler.toml` (`[alias]` na pliki `.cjs` dla `zod`, `zod/v3`, `zod/v4`, `zod/v4-mini`). Warto też trzymać jawny pin **`core-js-pure`** w `dependencies` instalacji izolowanej, jeśli `npm` dostarczy niekompletne drzewo `core-js-pure` (błędy `classof-raw` przy `wrangler deploy`).

## 3. Kontrakt integracji z EPIR (wyłącznie HTTP)

| Zasób | Metoda | Uwagi |
|--------|--------|--------|
| Marketing preview | `GET {MARKETING_INGEST_ORIGIN}/ops/marketing-preview` | Nagłówek `Authorization: Bearer` — ta sama semantyka co `MARKETING_OPS_PREVIEW_KEY` po stronie `epir-marketing-ingest`. |
| Analyst DO (opcjonalnie) | `POST …/ops/marketing-analyst/{instance}/refresh`, `GET …/state` | Ten sam Bearer; instancja = identyfikator sesji narzędzia. |
| Warehouse (opcjonalnie, faza późniejsza) | `POST {ANALYST_WORKER_ORIGIN}/v1/warehouse/query` | Osobny Bearer (`ANALYST_HTTP_BEARER`); tylko whitelist `queryId` — agent **nie** konstruuje SQL. |

**MUST:** żadnych kluczy Google/Shopify w repo agenta; wyłącznie URL-e workersów + tokeny serwisowe w `wrangler secret`.

## 4. Możliwości Agents SDK (fazy po bramkach ESOG)

| Faza | Zakres | Pełnia „mocy” SDK |
|------|--------|-------------------|
| **A** | Worker + `routeAgentRequest` + jedna klasa `Agent` + `initialState` + `@callable` (np. `syncPreview`, `getStateSummary`) | Routing, persystencja stanu, RPC callable z klienta wewnętrznego. |
| **B** | `AIChatAgent` / streaming odpowiedzi, narzędzia (tool calls) owijające fetch do powyższych URL-i | Model + narzędzia bez wycieku sekretów do promptu. |
| **C** | Harmonogram (`schedule` / alarmy DO tam gdzie wspiera SDK), ewentualny MCP **klient** tylko do zatwierdzonych endpointów EPIR | Automatyzacja i rozszerzalność przy zachowaniu fail-closed. |
| **D** | Twarde wejście: Cloudflare Access i/lub dodatkowy Bearer na upgrade WebSocket, limity, audyt | Zgodność z guardrails produkcyjnymi. |

Każda faza kończy się **osobną rundą ESOG** (werdykt zgodny ze skalą w `epir-esog-agent`).

## 5. Procedura „rewizor → następny krok”

1. **Rewizor (ESOG)** ocenia ten dokument (+ przy kodzie: `wrangler.toml`, `src/`, brak sekretów).
2. Werdykt **Compliant** lub **Partially** z zamkniętą listą MUST → autor wdrożenia wykonuje **tylko** zamknięte MUST, potem ponowna runda.
3. Werdykt **Non-compliant** / **Needs design** → **brak** merge/deploy do produkcji do czasu projektu decyzji w kanonie (`EPIR_AI_ECOSYSTEM_MASTER`, `EPIR_AI_BIBLE`, `EPIR_DEPLOYMENT_AND_OPERATIONS`).
4. Po akceptacji planu: utworzenie **publicznego** repo (np. `EPIRjewelry/epir-marketing-agent-service`) — treść może być najpierw zsynchronizowana z katalogiem `epir-marketing-agent-service/` w tym monorepo (źródło do `git subtree split` / ręcznego push), albo wyłącznie w nowym repo; **nie** dwa różne „prawdziwe” zestawy dokumentacji biznesowej.

## 6. Dokumentacja w `aplikacja_epir` po utrwaleniu

- Krótki pointer w `docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md` (sekcja marketing / ops): link do publicznego repo + lista sekretów po stronie agenta — **dopiero po** pierwszym PASS ESOG dla kodu szkieletu.

## 7. Ryzyka (jawne)

- **Supply chain:** zależność od `agents` i podgrafu MCP — pin wersji, `npm audit`, brak `postinstall` z sieci.
- **Prompt injection:** model w fazie B nie traktuje odpowiedzi z preview jako instrukcji systemowych; narzędzia zwracają JSON, nie „surowy” tekst do kontekstu bez normalizacji.
- **Dane PII:** preview marketingowy może zawierać dane agregowane; polityka retencji i dostępu jak dla `GET /ops/marketing-preview` (Bearer, Access).

---

**Następny krok po PASS ESOG dla tego planu:** szkielet publicznego projektu Worker (`agents` + `wrangler` + healthz + jeden `@callable` wołający `GET /ops/marketing-preview` przez sekret).
