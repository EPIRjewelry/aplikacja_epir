# EPIR Ingress and Runtime

## Cel

Ten dokument definiuje aktualny kontrakt wejścia do systemu EPIR AI oraz faktyczny runtime przepływu czatu. Jest technicznym rozwinięciem `EPIR_AI_ECOSYSTEM_MASTER.md` i nie może z nim kolidować.

## Kanoniczne ścieżki

| Kontekst             | Browser endpoint                     | Serwerowy endpoint                       | Uwagi                                                             |
| -------------------- | ------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| Online Store         | `https://{shop}/apps/assistant/chat` | `https://asystent.epirbizuteria.pl/chat` | Tylko przez Shopify App Proxy; worker akceptuje podpisany forward |
| Headless `kazka`     | `/api/chat`                          | `https://asystent.epirbizuteria.pl/chat` | Browser rozmawia wyłącznie z lokalnym BFF                         |
| Headless `zareczyny` | `/api/chat`                          | `https://asystent.epirbizuteria.pl/chat` | Browser rozmawia wyłącznie z lokalnym BFF                         |
| Wewnętrzne S2S       | —                                    | `https://asystent.epirbizuteria.pl/chat` | Wyłącznie serwer–serwer                                           |

Nie wolno mylić App Proxy `.../apps/assistant/chat` z serwerowym endpointem S2S `/chat`.

## Ingress dla Online Store

### Kontrakt

- przeglądarka kupującego uderza w Shopify App Proxy,
- Shopify forwarduje podpisane żądanie do Chat Workera,
- worker weryfikuje HMAC,
- brak poprawnego podpisu kończy się `401 Unauthorized`.

### Fakty implementacyjne

- App Proxy jest skonfigurowany w `shopify.app.toml` z `prefix = "apps"` i `subpath = "assistant"`.
- `workers/chat/src/index.ts` obsługuje buyer-facing trasę `POST /apps/assistant/chat`, ale w praktyce akceptuje też podpisany App Proxy flow na `POST /chat`.
- Weryfikacja podpisu jest realizowana w `workers/chat/src/security.ts`.
- Dla realnego Shopify App Proxy z query `signature` weryfikacja HMAC dotyczy wyłącznie kanonizowanego query bez pól podpisu.
- Dla pomocniczego nagłówka `x-shopify-hmac-sha256` używanego w testach lub niestandardowych klientach komunikat podpisu składa się z kanonizowanego query oraz surowego body żądania.

## Ingress dla storefrontów headless

### Kontrakt

Headless storefront nie komunikuje się bezpośrednio z workerem z poziomu przeglądarki. Obowiązuje wzorzec:

1. browser → `POST /api/chat`
2. Remix / Pages BFF → `POST https://asystent.epirbizuteria.pl/chat`
3. nagłówki S2S:
   - `X-EPIR-SHARED-SECRET`
   - `X-EPIR-STOREFRONT-ID`
   - `X-EPIR-CHANNEL`

### Fakty implementacyjne w repo

- `apps/kazka/app/lib/resolve-chat-api-url.ts` zwraca `/api/chat`.
- `apps/zareczyny/app/lib/resolve-chat-api-url.ts` zwraca `/api/chat`.
- `apps/kazka/app/routes/api.chat.ts` dokleja `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL`.
- `apps/zareczyny/app/routes/api.chat.ts` robi to samo dla swojego storefrontu.
- `workers/chat/src/index.ts` odrzuca żądania S2S bez sekretu (`401`) albo bez `storefrontId` / `channel` (`400`).

## Kontekst runtime: `storefrontId` i `channel`

Te dwa pola są podstawowym kontekstem wykonania po przejściu ingressu.

Typowe wartości:

- `online-store`
- `hydrogen-kazka`
- `hydrogen-zareczyny`
- `internal-dashboard`

Worker używa ich do:

- routingu persony,
- wyboru źródeł wiedzy i profilu storefrontu,
- separacji buyer-facing i internal flows.

## Fakty o `ChatWidget`

Aktualny kod `packages/ui/src/ChatWidget.tsx` wysyła w body między innymi:

- `message`
- `session_id`
- `cart_id`
- `brand`
- `stream`
- `storefrontId`
- `channel`

To oznacza, że stara teza o braku `storefrontId` / `channel` w body jest nieaktualna i nie może wracać do dokumentacji ani indeksu RAG.

## Runtime stanu rozmowy

- stan sesji jest utrzymywany przez `SessionDO`,
- historia rozmowy jest archiwizowana w D1,
- historia sesji nie jest tym samym co historia zamówień,
- buyer-facing asystent nie powinien obiecywać pełnej historii zamówień bez dedykowanego narzędzia i jawnego wsparcia backendowego.

## RAG i MCP w runtime

- `workers/chat` korzysta z service binding `RAG_WORKER`,
- `workers/chat/src/rag-client-wrapper.ts` próbuje najpierw `workers/rag-worker`, a potem fallback lokalny,
- `workers/rag-worker` obsługuje `/health`, `/search/products`, `/search/policies`, `/context/build`,
- endpointy MCP (`/mcp/tools/*` oraz podpisana trasa `/apps/assistant/mcp`) są pomocniczymi endpointami backendowymi / compatibility routes, a nie drugim buyer-facing kontraktem browser → worker,
- MCP i aktualne dane commerce pozostają źródłem preferowanym tam, gdzie potrzebna jest świeżość danych.

## Wzorce zabronione

Non-compliant są w szczególności:

- bezpośredni browser `fetch` do `https://asystent.epirbizuteria.pl/chat`,
- wkładanie `X-EPIR-*` do kodu klienta,
- wkładanie sekretów do frontendu,
- opisywanie App Proxy i `/chat` jakby były tym samym endpointem,
- dokumentowanie starych rozjazdów jako stanu bieżącego.

## Pliki kontrolne do audytu

- `packages/ui/src/ChatWidget.tsx`
- `apps/kazka/app/lib/resolve-chat-api-url.ts`
- `apps/kazka/app/routes/api.chat.ts`
- `apps/zareczyny/app/lib/resolve-chat-api-url.ts`
- `apps/zareczyny/app/routes/api.chat.ts`
- `workers/chat/src/security.ts`
- `workers/chat/src/index.ts`
- `workers/chat/src/rag-client-wrapper.ts`
- `workers/rag-worker/src/index.ts`
