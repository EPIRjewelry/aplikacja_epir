# ADR 0001: Tożsamość klienta w kanale TAE → App Proxy (Liquid)

## Status

Zaakceptowane

## Kontekst

Asystent w motywie (TAE) woła backend przez Shopify App Proxy. Shopify dopisuje do żądania m.in. `logged_in_customer_id` oraz podpisuje parametry (`signature` / HMAC). W body często pojawia się pole `customer_id_hint` z frontendu lub integracji.

## Decyzja

1. **W kanale Liquid → App Proxy** podstawowym źródłem pewnego ID klienta jest wartość **`logged_in_customer_id`** z query stringu **po** pozytywnej weryfikacji **HMAC** App Proxy (wspólny sekret aplikacji, zgodnie z dokumentacją Shopify). **Uzupełnienie:** patrz pkt 4 (Session Token JWT).

2. **`customer_id_hint`** z body **nigdy** nie jest używane jako identyfikator klienta do celów tożsamości: nie mapujemy go na pamięć długoterminową, nie traktujemy jako dowodu logowania ani jako zamiennika `logged_in_customer_id`. Może pozostać zwykłym polem w payloadzie (np. telemetria, korelacja analityczna), **bez wpływu na poziom wiary w tożsamość**.

3. **Brak flagi ani „trybu awaryjnego”** w workerze, który by ufał hintowi zamiast parametru Shopify — zmiana tej zasady wymagałaby **osobnego, świadomego projektu** (np. osobny kanał z Customer Account API / OAuth), a nie przełącznika w tym samym kontrakcie App Proxy.

4. **Session Token Shopify** (JWT w `Authorization: Bearer`, zweryfikowany przez worker: `HS256` + `SHOPIFY_APP_SECRET`, opcjonalnie `aud` / `dest`) — gdy claim **`sub`** zawiera `gid://shopify/Customer/...`, jest to **drugie** pewne źródło ID klienta obok `logged_in_customer_id` z query po HMAC; nie zastępuje regulacji punktów 2–3 dla `customer_id_hint`.

## Konsekwencje

- Przy pustym `logged_in_customer_id` **i** braku ważnego Session Token z poprawnym `sub` mimo wizualnego „zalogowania” (np. NCA) backend pozostaje przy **anonimowej, zaufanej sesji** proxy lub S2S — to ograniczenie kanału / klienta, nie błąd do obejścia hintem z JS.
- Kod workera `chat` realizuje powyższą politykę w `handleChat` / `streamAssistantResponse` (m.in. `memoryShopifyCustomerId` z ID z URL po HMAC albo z JWT `sub` po weryfikacji tokenu).

## Uzupełnienie: Shopify Session Token (JWT)

Gdy klient przekazuje **zweryfikowany** Session Token Shopify w nagłówku `Authorization: Bearer <jwt>` (wg dokumentacji Session Token API / Customer Account UI Extensions), worker **weryfikuje podpis** (`HS256`, `SHOPIFY_APP_SECRET`) oraz opcjonalnie `aud` (`SHOPIFY_CLIENT_ID`) i `dest` (zgodność ze sklepem). Claim `sub` w postaci `gid://shopify/Customer/...` jest wtedy **równorzędnym źródłem pewnego ID klienta** jak `logged_in_customer_id` po App Proxy — nadal **bez** promocji `customer_id_hint` z body do tożsamości.
