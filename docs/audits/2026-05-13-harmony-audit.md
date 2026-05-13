# Audyt post-Harmony (wdrożenie `ea0dc3b`)

Data: 2026-05-13. Zakres: `workers/chat` + rozszerzenie TAE (asystent-klienta). Deploy MCP Cloudflare Observability: **niedostępny** (w katalogu MCP wtyczki jest wyłącznie `mcp_auth.json`, brak narzędzi zapytań logów).

## TL;DR

Format Harmony dla `groq/openai/gpt-oss-120b` jest spójny z konfiguracją i parserem SSE w `ai-client.ts`. Brak `response_format` w `workers/chat/src`. Wdrożono **hotfix** `sanitizeHarmonyHistory`: przed każdym wywołaniem Gateway / Workers AI oraz przy budowie `aiHistory` w `index.ts` usuwane są kanały analysis/commentary i pola `reasoning` z historycznych tur `assistant`, bez dotykania `tool_calls` ani wiadomości `role: tool`. Test regresyjny w `harmony_tool_call_smoke.test.ts`. `npm test`: 241/241 OK. `npx tsc --noEmit` w `workers/chat` kończy się **exit 2** wyłącznie przez **wcześniejsze** błędy typów w plikach `test/**` (stuby DO bez `connect`); **brak** komunikatów o błędach w ścieżkach `src/**`.

---

## Axis 1 — Format Harmony (zgodność ze spec)

| Element | Status | Uwagi |
|--------|--------|--------|
| `MODEL_VARIANTS.default.id` | PASS | `groq/openai/gpt-oss-120b` — `workers/chat/src/config/model-params.ts` |
| `MODEL_PARAMS` | PASS | `max_tokens: 2048`, `include_reasoning: true`, `reasoning_effort: 'low'` |
| Limity tur | PASS | `CHAT_MAX_TOKENS_TOOL_ROUND=2048`, `CHAT_MAX_TOKENS_AFTER_TOOL=768`, `CHAT_RECOVERY_MAX_TOKENS=256` |
| `.model-lock` | PASS | `LOCKED_MODEL_ID=groq/openai/gpt-oss-120b`, provider Groq via Gateway |
| `GatewayCompatBody` | PASS | `parallel_tool_calls`, `include_reasoning`, `reasoning_effort`; brak `response_format` |
| `response_format` + `tools` | PASS | `rg response_format` w `workers/chat/src` → **0** trafień |
| `createGroqStreamTransform` | PASS | `delta.content` → `text`; `delta.reasoning` / `delta.reasoning_content` → `reasoning`; slot merge `tool_calls`; `usage.completion_tokens_details.reasoning_tokens` → `usage.reasoning_tokens` |
| `parallel_tool_calls` w body | PASS | Ustawiane na `true` w `streamGroqEventsViaGateway` (linia ~942); `MODEL_PARAMS` nie duplikuje tego pola (świadomie w body streamu) |

---

## Axis 2 — Forma (typy, struktura, duplikaty)

| Element | Status |
|--------|--------|
| `GroqStreamEvent` | PASS | `reasoning` + `usage.reasoning_tokens` |
| `GroqMessage` | PASS | `tool_calls`, `tool_call_id`, `name` |
| Parser SSE (worker) | **Uwaga** | Kanoniczny pełny parser: `createGroqStreamTransform` w `ai-client.ts`. Dodatkowo istnieje uproszczony `streamGroqResponse` (tylko `delta.content` → string) — **nie** używany z `index.ts`; ścieżka legacy / eksport. |
| Parser klienta | PASS | Jeden `processSSEStream` w `extensions/asystent-klienta/assets/assistant-runtime.js` |
| ESLint | N/A | W `workers/chat/package.json` brak skryptu `lint` — pominięto |
| `tsc` | **Częściowo** | Błędy wyłącznie w `test/*.ts` (pre-existing); `src/**` bez błędów w logu `tsc` |

---

## Axis 3 — Deployment health (Cloudflare Workers Logs, 24h)

**Status: NEEDS_FOLLOWUP**

Serwer MCP `plugin-cloudflare-cloudflare-observability` w workspace zawiera tylko `tools/mcp_auth.json` — brak narzędzi do zapytań logów / observability. Nie zweryfikowano: `chat.harmony.reasoning`, `chat.stream.turn`, `AI Gateway streaming error: 400`, ani próbek `[streamAssistant] ✅ Strumień zakończony`.

---

## Axis 4 — Leftovers starego formatu

| Sprawdzenie | Wynik |
|-------------|--------|
| `stripLeakedToolCallsLiterals` / `containsLikelyToolMarkupLeak` | **0** trafień w repo (poza `node_modules`) |
| `luxury-system-prompt.ts` | PASS | Brak `<|`, `tool_calls":[`, `respond with JSON` |
| `assistant-runtime.js` | PASS | Brak lokalnych scrubberów w stylu `stripLeakedToolCallsLiterals` |
| `kimi_k25` | PASS | Oznaczony `@deprecated` w `model-params.ts`; call site: `resolveAdminModelVariantFromHeaders` (`ai-client.ts`, `index.ts` ~3498) |
| Komentarze `index.ts` | PASS | Zaktualizowano nagłówek pliku (Harmony / `streamGroqEvents`) i komentarz przy `MAX_TOOL_OUTPUT_LENGTH` |
| `.gitignore` | PASS | Dodano `.kilo/` |

---

## Hotfix zaimplementowany (Axis 5)

### Nowy plik: `workers/chat/src/utils/sanitizeHarmonyHistory.ts`

- Usuwa z obiektów `assistant`: pola `reasoning`, `reasoning_content`, `analysis`.
- Czyści string / części `text` w tablicy multimodal z markerów Harmony i literałów typu `assistantfinal`.
- Nieużywa importu z `ai-client` (uniknięcie cyklu modułów).

### `workers/chat/src/ai-client.ts`

- `sanitizeHarmonyHistory(messages)` na wejściu: `streamGroqEventsViaGateway`, `streamGroqEventsWorkersAi`, `getGroqResponseViaGateway`, `getGroqResponseWorkersAi`, oraz `streamGroqResponse` (legacy).

### `workers/chat/src/index.ts`

- Po zbudowaniu tablicy z historii sesji: `sanitizeHarmonyHistory(...)` przed `buildCurrentSessionVisibilityContext` i dalszym promptem.

### `workers/chat/tsconfig.src.json`

- Osobna konfiguracja `tsc` z zakresem tylko `src/**` (bez `test/**`), żeby mieć exit 0 dla kodu produkcyjnego przy zachowaniu pełnego `tsconfig.json` dla Vitest.

---

## Wyniki walidacji

| Polecenie | Wynik |
|-----------|--------|
| `npm test` (workers/chat) | **241 / 241** passed |
| `npm run -s lint` | Brak skryptu w `package.json` |
| `npx tsc --noEmit` | **Exit 2** — wyłącznie `test/app_proxy_ingress_hmac.test.ts`, `consent_*.ts`, `history_ingress.test.ts`, `ingress_s2s.test.ts`, `token_vault_sharding.test.ts` (stuby DO). **Żaden** błąd nie wskazuje na `src/`. |
| `npx tsc --noEmit -p tsconfig.src.json` | **Exit 0** — nowy plik konfiguracyjny z `include` tylko `src/**` + `../shared/**` (brak `test/**`) dla obiektywnej bramki typów produkcyjnego kodu. |

---

## Próbki logów produkcyjnych

Brak (Axis 3 NEEDS_FOLLOWUP).

---

## Rekomendacje otwarte

1. Uzupełnić konfigurację MCP Cloudflare Observability o narzędzia zapytań logów albo użyć innego kanału (dashboard / Logpush) dla audytu 400 i telemetrii Harmony.
2. Opcjonalnie: w CI wywoływać `tsc -p tsconfig.src.json` jako bramkę dla samego kodu workera (domyślny `tsconfig.json` nadal obejmuje testy Vitest).
3. Długoterminowo: scalić lub oznaczyć `@deprecated` uproszczony `streamGroqResponse`, jeśli nie jest już potrzebny poza testami.
