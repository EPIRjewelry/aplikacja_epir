# ADR 0001: Tożsamość klienta w kanale TAE → App Proxy (Liquid)

## Status

Zaakceptowane

## Kontekst

Asystent w motywie (TAE) woła backend przez Shopify App Proxy. Shopify dopisuje do żądania m.in. `logged_in_customer_id` oraz podpisuje parametry (`signature` / HMAC). W body często pojawia się pole `customer_id_hint` z frontendu lub integracji.

## Decyzja

1. **Jedynym źródłem pewnego ID klienta Shopify w tym kanale** jest wartość **`logged_in_customer_id`** z query stringu **po** pozytywnej weryfikacji **HMAC** App Proxy (wspólny sekret aplikacji, zgodnie z dokumentacją Shopify).

2. **`customer_id_hint`** z body **nigdy** nie jest używane jako identyfikator klienta do celów tożsamości: nie mapujemy go na pamięć długoterminową, nie traktujemy jako dowodu logowania ani jako zamiennika `logged_in_customer_id`. Może pozostać zwykłym polem w payloadzie (np. telemetria, korelacja analityczna), **bez wpływu na poziom wiary w tożsamość**.

3. **Brak flagi ani „trybu awaryjnego”** w workerze, który by ufał hintowi zamiast parametru Shopify — zmiana tej zasady wymagałaby **osobnego, świadomego projektu** (np. osobny kanał z Customer Account API / OAuth), a nie przełącznika w tym samym kontrakcie App Proxy.

## Konsekwencje

- Przy pustym `logged_in_customer_id` mimo wizualnego „zalogowania” (np. New Customer Accounts) backend pozostaje przy **anonimowej, zaufanej sesji** proxy — to ograniczenie kanału, nie błąd do obejścia hintem z JS.
- Kod workera `chat` realizuje powyższą politykę w `handleChat` / `streamAssistantResponse` (m.in. `memoryShopifyCustomerId` tylko z URL po weryfikacji HMAC).
