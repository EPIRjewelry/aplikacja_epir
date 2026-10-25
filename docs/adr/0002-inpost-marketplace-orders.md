# ADR 0002: Worker marketplace Von Halsky (INPSA) — osobno od ShipX

## Status

Zaakceptowane — decyzja właściciela produktu (2026-10-23).

Ten zapis ustala granicę i kolejność. Nie wdraża workera, nie tworzy sekretów Cloudflare i nie publikuje nic na sklep ani na edge.

## Kontekst

EPIR sprzedaje w jednym sklepie Shopify przez jedną aplikację `epir_ai` i jedno repozytorium `EPIRjewelry/aplikacja_epir`.

InPost w tym repozytorium występuje dziś jako **ShipX — lookup punktów odbioru**:

- katalog `workers/inpost`, nazwa workera `epir-inpost-proxy`;
- hosty `https://api-shipx-pl.easypack24.net` oraz sandbox `https://sandbox-api-shipx-pl.easypack24.net`;
- token: `{baseUrl}/oauth2/token`, scope `openid api:apipoints` (albo statyczny `INPOST_ACCESS_TOKEN`);
- sekrety i bindingi `INPOST_CLIENT_ID`, `INPOST_CLIENT_SECRET`, `INPOST_ACCESS_TOKEN`, `INPOST_ENV`, KV `INPOST_POINTS_CACHE`.

Von Halsky to **marketplace INPSA** (oferty i zamówienia) na innym IdP, innych hostach i innych scope’ach. Portal: [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/).

Fakty portalu użyte w tej decyzji (bez dopisywania ścieżek, pól i parametrów spoza portalu):

| Środowisko | API | Token (Client Credentials) |
|---|---|---|
| Stage | `https://stage-api.inpost-group.com/inpsa/` | `https://stage-account.inpost-group.com/oauth2/token` |
| Prod | `https://api.inpost-group.com/inpsa/` | `https://account.inpost-group.com/oauth2/token` |

- Merchant może użyć **Client Credentials**.
- Scope’y dokładnie: `openid api:categories:read api:offers:read api:offers:write api:orders:read api:orders:write`.
- Access token żyje około **5 minut**.
- Zamówienia: poll zdarzeń `GET …/orders/events`, nie sam listing.
- Merchant: **auto-accept po płatności**.
- `customer` oraz `delivery.email` są dostępne dopiero przy statusie **ACCEPTED** i opłaceniu.
- Fulfillment: przesyłka ShipX z `delivery.email`. API marketplace tej przesyłki nie tworzy.

Właściciel produktu ustalił kolejność: najpierw Client Credentials na **stage**, potem use case zamówień; synchronizacja ofert później.

## Decyzja

1. Nowy worker Cloudflare: katalog `workers/inpost-marketplace`, proponowana nazwa `epir-inpost-marketplace`.
2. `workers/inpost` zostaje proxy punktów ShipX. Ten ADR nie zmienia jego kodu, bindingów ani zachowania.
3. Jedna aplikacja Shopify `epir_ai` i to samo repozytorium. Zamówienie marketplace ląduje w istniejącym sklepie ze **źródłem i tagiem `inpost-vh`**.
4. Kolejność implementacji (osobne zmiany, każda po zgodzie operatora na sekrety i na live):
   1. Client Credentials na stage (token + wywołanie stage API).
   2. UC zamówień: poll zdarzeń → mapowanie → zamówienie Shopify `inpost-vh`.
   3. Synchronizacja ofert — później.
5. Fulfillment zostaje handoffem do ShipX (`delivery.email`) w osobnym kroku. Ten worker go nie wykonuje.

## Odrzucone alternatywy

### Rozszerzenie `workers/inpost`

ShipX i INPSA mają osobne hosty OAuth, osobne scope’y (`api:apipoints` wobec zestawu marketplace) i osobny czas życia tokenu (ShipX trzyma też ścieżkę statycznego `INPOST_ACCESS_TOKEN` oraz zapas wygaśnięcia rzędu godziny w `workers/inpost/src/inpost-api.ts`; token INPSA wygasa w około 5 minut). Wspólny zestaw `INPOST_*` połączyłby lookup punktów z kontem marketplace. Lookup punktów i ingest zamówień zostają osobnymi procesami.

### Druga aplikacja Shopify

Kanon (`EPIR_AI_BIBLE.md`): jedna aplikacja `epir_ai`. Kanał marketplace jest tagiem i źródłem zamówienia `inpost-vh` w tym sklepie.

### Osobne repozytorium

Kanon (`AGENTS.md`): jedno repo źródłowe `EPIRjewelry/aplikacja_epir`. Drugi backend poza tym drzewem jest błędem założeń.

## Przepływ UC v1

Implementacja tego przepływu **nie** wchodzi w zmianę, która dodaje ten ADR. Poniżej jest kontrakt kolejności.

1. **Token stage (Client Credentials).**  
   `POST https://stage-account.inpost-group.com/oauth2/token` ze scope’ami dokładnie:  
   `openid api:categories:read api:offers:read api:offers:write api:orders:read api:orders:write`.  
   Baza API: `https://stage-api.inpost-group.com/inpsa/`.  
   Token trzymany w pamięci workera i odświeżany przed upływem około 5 minut. Długowieczny sekret z access tokenem nie jest wzorcem dla INPSA (inaczej niż opcjonalny `INPOST_ACCESS_TOKEN` w ShipX).  
   Hosty prod są zapisane wyżej i czekają na osobną zgodę operatora. Domyślne środowisko v1 to stage.

2. **Zdarzenia zamówień.**  
   Portal OpenAPI (`gokart-api.html`): `GET {baza INPSA}/v1/organizations/{organizationId}/orders/events` (`INPSA_ORGANIZATION_ID`). Zdarzenia idą od najnowszych; `untilId` zwraca tylko starsze niż podane id — kursor nie jest przekazywany jako `untilId` w pierwszym żądaniu. Sam listing zamówień nie zastępuje polla zdarzeń.  
   Konfiguracja merchanta: auto-accept po płatności. UC v1 nie dodaje osobnego kroku ręcznego accept.  
   Zamówienie w Shopify powstaje tylko dla zdarzenia **PAID**, gdy `paymentDetails.payments` jest niepuste. `CREATED` i `ACCEPTED` przesuwają kursor i nie zapisują klucza idempotencji.  
   `customer.email` oraz `delivery.email` to hash `@market.inpostpay.pl` (proxy InPost), unikalny per zamówienie. Pełny obiekt `delivery` (adres nadania) jest wypełniony dopiero po nadaniu przesyłki.

3. **Zamówienie Shopify.**  
   Zmapowane zamówienie powstaje przez Admin API istniejącej aplikacji `epir_ai`, ze źródłem i tagiem `inpost-vh`.  
   Powtórzony poll tego samego zamówienia marketplace nie tworzy drugiego zamówienia (idempotencja `inpsa-order:{orderId}`). Token Admin potrzebuje scope `write_orders` oraz `read_products` (wyszukanie wariantu po SKU). Tego ADR nie zmienia `shopify.app.toml`.

4. **Handoff ShipX.**  
   Po zamówieniu Shopify przesyłkę tworzy istniejący tor ShipX. E-mail odbiorcy **musi** być `order.delivery.email` (hash `@market.inpostpay.pl`, unikalny per zamówienie — FAQ). Nie używać `customer.email` ani `invoice.email` jako adresu nadania. Wywołanie idzie do API ShipX, nie do API marketplace i nie do tego workera. `workers/inpost` w obecnym kształcie obsługuje punkty, nie etykiety; etykiety są osobnym krokiem poza v1. Ten ADR nie dodaje kodu ShipX.

Scope’y kategorii i ofert są na kliencie OAuth, bo portal podaje ten zestaw w całości. UC v1 ich nie wywołuje.

## Propozycja nazw sekretów

Tylko propozycja. **Żaden sekret nie jest tworzony** (`wrangler secret put`, Pages, `.dev.vars`, MCP). Governance (`docs/kb/WORKERS_AND_EDGE.md`): nowa nazwa sekretu wymaga zgody operatora. Zgoda na ten ADR nie jest zgodą na `wrangler secret put`.

Nazwy są rozłączne z `INPOST_*` z `workers/inpost/src/env.ts` i `workers/inpost/wrangler.toml`.

| Nazwa | Rodzaj | Rola |
|---|---|---|
| `INPSA_CLIENT_ID` | sekret (propozycja) | `client_id` Client Credentials INPSA |
| `INPSA_CLIENT_SECRET` | sekret (propozycja) | `client_secret` Client Credentials INPSA |
| `INPSA_ENV` | zmienna zwykła, nie sekret | `stage` (v1) albo `production` (dopiero po zgodzie operatora na prod) |
| `INPSA_ORGANIZATION_ID` | zmienna zwykła, nie sekret (propozycja) | Id organizacji merchanta z portalu INPSA — segment ścieżki OpenAPI `GET /v1/organizations/{organizationId}/orders/events` (względem bazy `…/inpsa/`) |

Świadomie pominięte:

- Reużycie `INPOST_CLIENT_ID`, `INPOST_CLIENT_SECRET`, `INPOST_ENV`, `INPOST_ACCESS_TOKEN`, `INPOST_POINTS_CACHE`.
- Sekret `INPSA_ACCESS_TOKEN` — token jest krótkotrwały i pochodzi z Client Credentials w runtime.
- Nowa nazwa sekretu Shopify. Zapis zamówienia użyje Admin API aplikacji `epir_ai` już obecnej w ekosystemie; binding na tym workerze wybieramy przy implementacji, po zgodzie operatora, bez dokładania nazwy w tym ADR.
- Wpis tych nazw do `scripts/debug/cf-missing-secrets.mjs` — skrypt audytuje sekrety, które mają istnieć. Te jeszcze nie istnieją.

## Poza zakresem

- Synchronizacja ofert (`api:offers:read` / `api:offers:write`) i odczyt kategorii.
- Tworzenie przesyłek, etykiet i punktów ShipX w tym workerze.
- Zmiana zachowania `workers/inpost`.
- Deploy, `wrangler deploy`, mutacje prod INPSA, mutacje sklepu (zamówienia, tagi, metafieldy) i `wrangler secret put`.
- Drugi sklep, druga aplikacja Shopify, drugie repozytorium.
- Dopisywanie ścieżek REST, ciał żądań i nazw pól, których nie ma w portalu INPSA.

## Konsekwencje

- Katalog `workers/inpost-marketplace` ma `package.json`, `wrangler.toml` i kod UC v1 (poll zdarzeń → mapowanie → Shopify `orderCreate` z tagiem/źródłem `inpost-vh`). Domyślny ops poll: `dryRun=1` (bez zapisu do sklepu i bez mutacji D1). Live: `dryRun=0` tylko po zgodzie operatora.
- Binding D1 `INPSA_ORDERS_DB` (cursor `last_success_event_id` + `last_success_occurred_at`, klucz `inpsa-order:{marketplaceOrderId}`) — w `wrangler.toml` placeholder `database_id`. Prawdziwe `d1 create` i podmiana id są **twardym krokiem operatora przed pierwszym** `dryRun=0`. Schema: `migrations/0001_inpsa_orders.sql`. Sekret Shopify: istniejąca nazwa `SHOPIFY_ADMIN_TOKEN` + var `SHOP_DOMAIN`. Token musi mieć `write_orders` i `read_products` (bez zmiany scope w `shopify.app.toml` w tym kroku).
- `.github/workflows/deploy.yml` nadal **nie** obejmuje tego workera (jak `workers/inpost`). `wrangler deploy` / `secret put` / `d1 migrations apply` wymagają osobnej zgody.
- Odświeżanie tokenu INPSA: TTL około 5 minut. Nie kopiujemy zapasu `+1h` z `InpostApiClient` w ShipX.
- Kanał kupującego (App Proxy, Hydrogen, `storefrontId`) bez zmian. Ingest: INPSA → ten worker → Admin API `epir_ai`.

## Źródła w repo (lustro, bez zgadywania API)

- Format ADR: `docs/adr/0001-tae-app-proxy-customer-identity.md`
- ShipX, sekrety i hosty: `workers/inpost/wrangler.toml`, `workers/inpost/src/env.ts`, `workers/inpost/src/inpost-api.ts` (`baseUrl`, scope `openid api:apipoints`)
- Jedna aplikacja i jeden kanon: `EPIR_AI_BIBLE.md`, `AGENTS.md`
- Sekrety — zakaz nowych nazw bez zgody: `docs/kb/WORKERS_AND_EDGE.md` (sekcja Governance sekretów)
- Deploy CI (lista workerów, bez `workers/inpost`): `.github/workflows/deploy.yml`
- README workera (ton, brak sekretów w pliku): `workers/store-steward/README.md`
- Portal INPSA (jedyne źródło kształtu API): [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/)
