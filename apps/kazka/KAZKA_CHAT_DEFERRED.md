# Kazka — czat

**Status:** bazowy przeplyw jest wdrozony.

**Stan obecny:**

1. Frontend Hydrogen uzywa same-origin `POST /api/chat`.
2. `app/routes/api.chat.ts` jest prawdziwym BFF proxy do workera `POST /chat` z naglowkami `X-EPIR-*` i sekretem `EPIR_CHAT_SHARED_SECRET`.
3. Kontekst `storefrontId` / `channel` jest wyniesiony do `app/lib/chat-widget-context.ts`.
4. Loadery przekazuja tez `route` do `ChatWidget`, zgodnie z kontraktem workerowym.

**Do dopilnowania operacyjnie:**

1. Ustawic `EPIR_CHAT_SHARED_SECRET` w Cloudflare Pages dla `kazka-hydrogen-pages`.
2. Przy kolejnych zmianach utrzymac frontend bez logiki AI i bez bezposrednich wywolan backendu z przegladarki poza BFF.
