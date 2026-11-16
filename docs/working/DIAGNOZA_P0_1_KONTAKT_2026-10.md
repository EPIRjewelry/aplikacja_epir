# Diagnoza P0-1 — kontakt Gemma (GE/GZ/GK)

**Data:** 2026-10-16  
**Baza diagnozy:** `main` @ `d05cc80` (Merge #177)  
**Cel:** ustalić, skąd błędne lub brakujące dane kontaktowe, mimo że Knowledge Base (Storefront MCP) zwraca poprawne wpisy w wielu zapytaniach.  
**Ten PR:** wyłącznie logi diagnostyczne + testy dokumentujące ścieżki — **bez zmiany odpowiedzi dla klienta**.

---

## 1. Objawy (audyt symulacyjny 16.10, scenariusz S09)

| Kanał | Tura | Objaw (skrót) |
|-------|------|----------------|
| GE (`sess_06f35eae…`) | T1 | Mokotowska 57, godziny 10–18, bez telefonu |
| GE | T2 | Traugutta 123/5, I piętro, telefon +48 504 123 456, godziny 10–18 |
| GE | T3 | Przyznanie braku danych |
| GZ (`sess_4b062a30…`) | T1 | Dokładnie `FINAL_TOOL_FALLBACK_USER` — nie `KB_POLICY_UNAVAILABLE_REPLY` |
| GZ | T2 | Traugutta + wymyślone godziny |
| GZ | T3–T4 | Wymyślony telefon +48 71 555 12 34 |

**Fakty od operatora (nie w kodzie):** telefony **698 718 564** (EPIR) i **696 55 33 46** (wspólny EPIR i KAZKA — oba dopuszczalne w odpowiedziach z KB). Adres dla odwiedzających: **Traugutta 123/5** (I piętro, po umówieniu). Adres do korespondencji: **123/5-6**. KB podaje poprawne dane przy trafnych zapytaniach; hipoteza „wstrzyknąć kontakt na sztywno” **odpada**.

---

## 2. Ścieżka 1 — `FINAL_TOOL_FALLBACK_USER` (priorytet: GZ S09 T1)

Stała: `workers/chat/src/buyer/compose-buyer-turn.ts:86-87`.

### 2.1 Mapa miejsc → logi (przed tym PR)

| Miejsce | Linie | Tag / ślad |
|---------|-------|------------|
| `scrubToolAsTextOrFallback` | 502-514 | `buyer.tool_as_text_blocked` (bez `site`) |
| Wymuszenie bez tool call | 1021-1026 | wcześniej `buyer.tool_as_text_retry` / `buyer.cart_intent_force_tool` |
| Wymuszenie — błąd | 1041-1052 | `buyer.forced_tool_choice_failed` |
| Runda bez tool_calls, tool-as-text | 1055-1062 | `buyer.tool_as_text_blocked` (ten sam tag co finalize) |
| Final: tool poza allowlistą | 1141-1143 | **brak logu** |
| Gateway empty | `handle-buyer-turn.ts:166-179` | **brak logu** |
| `finishReply` | 15 wywołań (`:825`, `:989`, `:1035`, `:1065`, `:1078`, `:1080`, `:1110`, `:1136`, `:1148`, `:1152`, `:1154`, `:1166`, `:1180`, `:1184`, `:1196`) | wspólny `buyer.timing` bez miejsca fallbacku |

`FINAL_RECOVERABLE_TOOL_NAMES` (`:89-94`) **nie** obejmuje `search_shop_policies_and_faqs`. Gdy w rundzie finalnej (`toolChoice: 'none'`) model ponownie woła KB, możliwy jest fallback `:1141-1143` **bez śladu w logach** — hipoteza robocza dla GZ T1 (weryfikacja: Workers Logs + nowy tag `buyer.final_non_recoverable_tool`).

### 2.2 Logi dodane w tym PR (diagnostyka)

| Tag | Pola |
|-----|------|
| `buyer.tool_as_text_blocked` | `site`: `finalize_scrub` \| `round_no_tool_calls`, `keys`, `sid` |
| `buyer.forced_no_tool_call` | `forced`, `had_tool_as_text`, `sid` |
| `buyer.final_non_recoverable_tool` | `tool`, `sid` |
| `buyer.gateway_empty_content` | `channel_id`, `sid` |
| `buyer.tool_call` (tylko KB) | `tool`, `channel`, `ok`, `reason` (`empty`/`mcp_error`), `entry_count`, `sid` |

`sid` = pierwsze 8 znaków `session_id` (wzorzec `session-context.ts:157`). Bez treści `query` i bez PII.

---

## 3. Ścieżka 2 — zmyślone dane w odpowiedzi modelu

### 3.1 Przepływ KB

- Prompt: `luxury-system-prompt.ts:48`, `:65` — wołaj `search_shop_policies_and_faqs`; **bez wymuszenia** w runtime.
- Wykonanie: `execute-buyer-tool.ts:351-372` → `kb-policies.ts:188-219`.
- Błąd / pusta odpowiedź → `KB_POLICY_UNAVAILABLE_REPLY` jako **plain string** w `role: tool` (`execute-buyer-tool.ts:357-358`).
- Sukces → JSON `{ answer, sources }`.
- Parser QA[]: `kb-policies.ts:104-119`; testy: `buyer-kb-policies.test.ts` (w tym live shape tablicy `{question, answer}`).

### 3.2 Warianty a / b / c (co trafia do modelu)

| Wariant | Opis | Efekt w `messages` |
|---------|------|---------------------|
| **(a)** | Brak wywołania KB | Tylko system + historia + user; odpowiedź z `finishReply(text)` (`:1080`) |
| **(b)** | KB `[]` / błąd MCP | `tool` content = `KB_POLICY_UNAVAILABLE_REPLY` |
| **(c)** | KB „sukces”, treść nie na temat | JSON z `answer` (fragment FAQ); model może dopowiedzieć resztę |

### 3.3 Prompt vs kanały — reguła `:145`

Linia **:145** (`zakaz zmyślonych numerów/adresów`) jest w `KAZKA_HEADLESS_PERSONA_ADDON`, używanym w ścieżce **operatora** (`index.ts:356`, `:3844`), **nie** w turze kupującego.

Kupujący **GK** dostaje `KAZKA_BUYER_STORE_FACTS` (`compose-buyer-turn.ts:424-425`), bez tej reguły. **GE, GZ i GK** współdzielą bazowy `LUXURY_SYSTEM_PROMPT` (`:48`, `:56-57`, `:65`) bez explicite zakazu zmyślania kontaktu w stylu Kazka `:145`.

### 3.4 Obserwacje MCP (próbka 16.10, nie fakty)

Krótkie zapytania (`telefon`, `kontakt`, showroom bez zapowiedzi) często zwracają `[]`; pełniejsze pytania trafiają w wpisy z adresem/telefonem. Niestabilność `godziny otwarcia` w próbce. Szczegóły w briefie operatora — nie traktować jako stan produkcyjny bez audytu.

### 3.5 Runda finalna i utrata kontekstu tool

`buildFinalRoundFallbackMessages` (`:106-119`) wstawia skrót wyników tool do systemu; test `buyer-compose-turn.test.ts` potwierdza brak `role: tool` w wiadomościach do `getGroqResponse` po `buyer.tool_loop_fallback` final.

---

## 4. Korelacja Workers Logs (po deployu)

1. Filtr czas + worker chat; `session_id` z odpowiedzi API audytora.
2. `sid` = pierwsze 8 znaków `session_id`.
3. Dla fallbacku: `buyer.final_non_recoverable_tool`, `buyer.forced_no_tool_call`, `buyer.gateway_empty_content`, `buyer.tool_as_text_blocked` + `site`.
4. Dla KB: `buyer.tool_call` + `search_shop_policies_and_faqs` + `ok` / `reason` / `entry_count`.
5. PASS diagnozy na żywo: każda tura z „Nie udało się wykonać operacji…” → jedna linia kodu po logu; każda tura ze złym kontaktem → wariant a/b/c + log KB.

---

## 5. Plan testu na żywo (Audytor Gemmy, po deployu)

- Nowe sesje GE i GZ (GK opcjonalnie przy tym samym kodzie), prefiks **„TEST AUDYTU:”**.
- S09 T1–T3 + „jaki jest numer telefonu?” + „gdzie mogę przyjść obejrzeć biżuterię?” — **3×** na kanał.
- Zapis: `session_id`, godzina PL, treść odpowiedzi.
- Tabela korelacji: tura → logi → wariant a/b/c → plik:linia (jeśli fallback).

---

## 6. Opcje naprawy (do decyzji operatora — poza tym PR)

1. **Prompt** — doprecyzować w `luxury-system-prompt.ts:65` formułę `query` (pełne pytanie jak w trafnych hitach MCP), bez nowej reguły obok `:48`.
2. **FAQ w Shopify Knowledge Base** — wpis z rozróżnieniem adresu odwiedzających (123/5) vs korespondencja (123/5-6) i oboma numerami; cytaty z polityk według `kb-gemma-cytaty-polityk.md` jeśli dostępny w repo.
3. **Reguła przy braku danych z KB** — sprawdzić `:56-57`; ewentualnie jedna linia dla **wszystkich** kanałów buyer (GE/GZ/GK), bez dublowania `:65` i bez kopiowania `:145` z persony operatora.
4. **Runtime final round** — osobna analiza (np. polityka odzysku vs PR1); **nie** dodawać KB do `FINAL_RECOVERABLE_TOOL_NAMES` (koliduje z PR1, ryzyko 400 przy `toolChoice: 'none'`).

---

## 7. Punkty NIEPEWNE

- Dokładna linia kodu dla GZ S09 T1 przed deployem logów (hipoteza `:1141-1143` lub `gateway_empty_content`).
- Wpływ treści `ai_profile` (`zareczyny` vs `online-store`) na halucynacje — niezweryfikowany.
- Czy logować skrót `query` KB w przyszłości — wymaga osobnej zgody operatora.

---

## 8. Zakres zmian w PR (implementacja)

- `workers/chat/src/buyer/compose-buyer-turn.ts` — logi `site`/`sid`, `forced_no_tool_call`, `final_non_recoverable_tool`.
- `workers/chat/src/buyer/handle-buyer-turn.ts` — `buyer.gateway_empty_content`.
- `workers/chat/src/buyer/execute-buyer-tool.ts` — rozszerzony log KB.
- Testy: `workers/chat/test/buyer-compose-turn.test.ts`, `buyer-execute-tool.test.ts`, `buyer-handle-turn.test.ts`.

**Bez zmian:** `index.ts`, prompty, `FINAL_RECOVERABLE_TOOL_NAMES`, `MAX_TOOL_ROUNDS`, zachowanie odpowiedzi klienta.

---

## 9. Dokumentacja zewnętrzna

- [Policy and FAQs tool](https://shopify.dev/docs/agents/catalog/policy-and-faqs-tool)
- [Storefront MCP](https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront)
- [Managing FAQs (KB)](https://help.shopify.com/en/manual/promoting-marketing/knowledge-base/managing-faqs)
- [Groq tool use](https://console.groq.com/docs/tool-use/local-tool-calling)
- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- Kontrakt repo: `docs/EPIR_KB_MCP_POLICY_CONTRACT.md` §0.1, §0.3
