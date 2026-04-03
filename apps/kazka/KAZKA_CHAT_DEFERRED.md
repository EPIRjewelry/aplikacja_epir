# Kazka — czat (odłożone)

**Status:** nie prowadzimy tu teraz prac; wracamy później.

**Co jeszcze trzeba zrobić (P0 / architektura EPIR):**

1. **Ingress** — domyślny `CHAT_API_URL` wskazuje na `https://asystent.epirbizuteria.pl/chat` (ścieżka workera typowa pod S2S). Dla ruchu z przeglądarki docelowo: **`https://{domena-sklepu}/apps/assistant/chat`** (App Proxy) albo **BFF** (`/api/chat`) z sekretem tylko po stronie serwera, wzorując się na `apps/zareczyny`.
2. **`app/routes/api.chat.ts`** — nadal **mock** (echo); do zastąpienia prawdziwym proxy do workera z nagłówkami `X-EPIR-*`, jak w zareczyny.
3. **Stałe kontekstu** — rozważyć plik w stylu `chat-widget-context.ts` (jak w zareczyny), zamiast literałów `kazka` / `hydrogen-kazka` w `root.tsx` i `routes/chat.tsx`.
4. **Loader `root.tsx`** — brak `route` w danych dla `ChatWidget` (opcjonalne; dodać spójnie ze zrzutem ścieżki, jeśli worker ma z tego korzystać).

**Stan obecny:** `ChatWidget` z `@epir/ui` wymaga `storefrontId` i `channel`; w kazce są ustawione minimalnie, żeby monorepo się kompilował — to **nie** zamyka powyższych punktów.
