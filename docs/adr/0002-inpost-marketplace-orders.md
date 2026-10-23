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
   `GET {baza INPSA}/…/orders/events`.  
   Ścieżka po `inpsa/` pochodzi z portalu w chwili implementacji; ten ADR jej nie dopisuje. Sam listing zamówień nie zastępuje polla zdarzeń.  
   Konfiguracja merchanta: auto-accept po płatności. UC v1 nie dodaje osobnego kroku ręcznego accept.  
   `customer` i `delivery.email` czytamy, gdy zamówienie jest **ACCEPTED** i opłacone.

3. **Zamówienie Shopify.**  
   Zmapowane zamówienie powstaje przez Admin API istniejącej aplikacji `epir_ai`, ze źródłem i tagiem `inpost-vh`.  
   Powtórzony poll tego samego zdarzenia nie tworzy drugiego zamówienia (idempotencja po identyfikatorze zamówienia marketplace — pole bierzemy z portalu przy implementacji).

4. **Handoff ShipX.**  
   Po zamówieniu Shopify przesyłkę tworzy istniejący tor ShipX, z adresem `delivery.email`. Wywołanie idzie do API ShipX, nie do API marketplace i nie do tego workera. `workers/inpost` w obecnym kształcie obsługuje punkty, nie etykiety; etykiety są osobnym krokiem poza v1.

Scope’y kategorii i ofert są na kliencie OAuth, bo portal podaje ten zestaw w całości. UC v1 ich nie wywołuje.

## Propozycja nazw sekretów

Tylko propozycja. **Żaden sekret nie jest tworzony** (`wrangler secret put`, Pages, `.dev.vars`, MCP). Governance (`docs/kb/WORKERS_AND_EDGE.md`): nowa nazwa sekretu wymaga zgody operatora. Zgoda na ten ADR nie jest zgodą na `wrangler secret put`.

Nazwy są rozłączne z `INPOST_*` z `workers/inpost/src/env.ts` i `workers/inpost/wrangler.toml`.

| Nazwa | Rodzaj | Rola |
|---|---|---|
| `INPSA_CLIENT_ID` | sekret (propozycja) | `client_id` Client Credentials INPSA |
| `INPSA_CLIENT_SECRET` | sekret (propozycja) | `client_secret` Client Credentials INPSA |
| `INPSA_ENV` | zmienna zwykła, nie sekret | `stage` (v1) albo `production` (dopiero po zgodzie operatora na prod) |

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

- Szkielet katalogu: `workers/inpost-marketplace/README.md` wskazuje na ten ADR. Brak `package.json` i brak `wrangler.toml`, żeby root workspaces (`workers/*`) i Wrangler nie dostały celu deployu. Sąsiednie `wrangler.toml` (wzór: `workers/inpost/wrangler.toml`, `workers/store-steward/wrangler.toml`) wiążą `main`, bindingi i często identyfikatory zasobów — pusty szkielet z `main = "src/index.ts"` byłby fałszywym workerem.
- `.github/workflows/deploy.yml` deployuje zamknięty zbiór workerów (chat, analytics, bigquery-batch, store-steward, analyst-worker, marketing-ingest, dynamic-landing-liquid, rag-worker). `workers/inpost` też nie jest na tej liście. Ten katalog nie wchodzi do workflow.
- Gdy powstanie kod, odświeżanie tokenu liczy TTL około 5 minut. Nie kopiujemy zapasu `+1h` z `InpostApiClient` w ShipX.
- Kanał kupującego (App Proxy, Hydrogen, `storefrontId`) zostaje bez zmian. Ingest marketplace jest serwer–serwer: INPSA → ten worker → Admin API `epir_ai`.

## Źródła w repo (lustro, bez zgadywania API)

- Format ADR: `docs/adr/0001-tae-app-proxy-customer-identity.md`
- ShipX, sekrety i hosty: `workers/inpost/wrangler.toml`, `workers/inpost/src/env.ts`, `workers/inpost/src/inpost-api.ts` (`baseUrl`, scope `openid api:apipoints`)
- Jedna aplikacja i jeden kanon: `EPIR_AI_BIBLE.md`, `AGENTS.md`
- Sekrety — zakaz nowych nazw bez zgody: `docs/kb/WORKERS_AND_EDGE.md` (sekcja Governance sekretów)
- Deploy CI (lista workerów, bez `workers/inpost`): `.github/workflows/deploy.yml`
- README workera (ton, brak sekretów w pliku): `workers/store-steward/README.md`
- Portal INPSA (jedyne źródło kształtu API): [https://inpsa-api-portal.inpost-group.com/](https://inpsa-api-portal.inpost-group.com/)
