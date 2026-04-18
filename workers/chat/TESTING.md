# Testowanie chatbota EPIR

Krótka checklista do wykorzystania przy każdym wdrożeniu. Szersza narracja w planie `.cursor/plans/testowanie_chatbota_epir_*.plan.md`.

## 1. Vitest (obowiązkowe przed releasem)

```powershell
Set-Location d:\aplikacja_epir\workers\chat
npx --yes vitest@3.2.4 run
```

Oczekiwane: brak regresji w modułach `memory/`, `mcp_*`, `app_proxy_ingress_hmac`, `session_*`, `strip_leaked_tool_calls`.

## 2. Ręczne scenariusze E2E (theme + zalogowany klient)

W jednym terminalu:

```powershell
npx --yes wrangler@4.45.3 tail epir-art-jewellery-worker --format pretty
```

W przeglądarce – sklep `epirbizuteria.pl`, zalogowany klient testowy:

- [ ] **Powitanie bez narzędzi** — pierwsza wiadomość „Dzień dobry”, oczekuj `finish_reason:"stop"`, `tool_calls_count:0`.
- [ ] **FAQ / polityki** — pytanie o adres/wysyłkę, oczekuj wywołania `search_shop_policies_and_faqs` w logach (`phase:"tool_execute"`).
- [ ] **Produkt / katalog** — pytanie o konkretny kamień/metal, oczekuj wywołania narzędzia produktowego i odpowiedzi z linkiem.
- [ ] **Druga tura pamięci** — kolejne pytanie w tej samej sesji, sprawdź w logach `cross_session_summary_present:true` oraz (po chwili) `phase:"extract"` z `facts_new>=1` lub `raw_turns_indexed>=1`.
- [ ] **Brak błędów** — żadnych `embed failed`, `memory_extract_missing_db`, `HMAC verification failed`.

## 3. Obserwowalność – kryteria sukcesu technicznego

| Tag | Pole | Wartość oczekiwana |
|-----|------|--------------------|
| `chat.memory` `phase:"embed"` | `latency_ms` | <500 ms, `model:"@cf/baai/bge-small-en-v1.5"` |
| `chat.memory` `phase:"extract"` | `facts_new + raw_turns_indexed + vectors_upserted` | >0 dla tury z treścią |
| `chat.stream.turn` | `finish_reason` | `"stop"` (nie `"length"` / `"error"`) |
| `chat-pipeline` `phase:"tool_execute"` | `status` | `"success"` |

Warningi dopuszczalne: `LLM extractor skipped: extractor_timeout` (opcjonalne wzbogacenie).

## 4. Przy regresji

1. Powtórz scenariusz z zakładką DevTools → Network, zapisz payload `/chat`.
2. Dorzuć przypadek brzegowy do `workers/chat/test/` (Vitest) zanim zrobisz fix.
3. Redeploy: `npx --yes wrangler@4.45.3 deploy` z `workers/chat`.
