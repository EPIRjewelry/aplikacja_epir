# Powitanie po imieniu — jak nie biegać w kółko

## Co sugeruje Twoja obserwacja („wcześniej działało, zmieniliśmy tylko model”)

Możliwe są **trzy niezależne rzeczywistości** — bez rozstrzygnięcia która dotyczy Waszego ostatniego deployu **nie da się** sensownie winić „tylko modelu” ani „tylko Shopify”:

| Jeśli na **jednym** rzeczywistym żądaniu z motywu… | Wniosek |
|-----------------------------------------------------|---------|
| `chat.ingress.customer_context` ma `identity_level: "customer"` i niepusty `logged_in_customer_id_raw` | Tożsamość **jest**. Problem leży w **warstwie modelu/promptu** albo w **ścieżce pierwszej wiadomości** (patrz niżej), **nie** w App Proxy. |
| To samo, ale `effective_customer_id_present` true a model i tak bez imienia | Raczej **getCustomerById / SessionDO / kontekst dynamiczny** albo model ignoruje instrukcję — **nie** „brak `logged_in_customer_id`”. |
| `app_proxy_verified: true` ale `identity_level: "anonymous"` i pusty `logged_in_customer_id` | **Shopify nie dopisał parametru** w tym żądaniu — zmiana modelu tego **nie wyjaśnia**; to kanał/dzień kont/konfiguracja sklepu vs poprzedni pomiar. |
| `identity_level: "s2s"` | Żądanie **nie** poszło tą samą ścieżką co Liquid App Proxy (np. inny host, test bez podpisu). Porównuj z **tym samym URL** co wcześniej. |

**Ważne:** W diagnostyce sesji debug część wpisów pochodziła z **Vitest** (`pathname: /chat`), a nie z przeglądarki na `/apps/assistant/chat` — takie logi **nie** są dowodem na stan „produkcyjnego” czatu. Żeby nie kręcić się w kółko, jedna telemetria musi być z **tego samego kroku użytkownika** co wcześniej (ten sam sklep, ta sama strona, ta sama ścieżka proxy).

## Dlaczego „zmieniliśmy tylko model” może wyglądać jak brak imienia **bez** zepsucia App Proxy

1. **Instrukcje / parametry modelu** — nowy model może słabiej przestrzegać sekcji personalizacji w [`luxury-system-prompt.ts`](workers/chat/src/prompts/luxury-system-prompt.ts) (inny routing wariantu, `temperature`, skrócony kontekst).
2. **[GREETING PREFILTER]** w [`index.ts`](workers/chat/src/index.ts) (ok. 2669–2696) — przy krótkim „Dzień dobry” / „Cześć” worker może wstawić **szablonowe** powitanie **bez imienia**, zanim wejdzie pełny stream. To jest **niezależne od wyboru modelu LLM** dopóki ten blok nie uwzględnia imienia.
3. **Miękka ścieżka** — imię z `customer_id_hint` + `getCustomerById` może zwracać `null` (API, format ID); wtedy nawet stary model nie miałby skąd wziąć imienia — ale wtedy **wcześniej** mogło „działać”, bo działała **twarda** ścieżka z `logged_in_customer_id`.

## Jedna procedura „żeby nie biegać w kółko”

Wykonajcie **raz**, w tej kolejności, na **produkcyjnym** motywie:

1. **Złap jedno** `chat.ingress.customer_context` z `wrangler tail` przy wysłaniu wiadomości z czatu (upewnijcie się, że to ten sam endpoint co w ustawieniach motywu, zwykle `/apps/assistant/chat`).
2. **Zapisz trzy pola:** `app_proxy_verified`, `identity_level`, oraz czy `logged_in_customer_id_raw` jest niepusty (wystarczy obecność / długość).
3. **Rozgałęź:**
   - **customer** → skupcie się na: prefiltrze powitań, treści `dynamicContext` w streamie, wariancie modelu — **nie** na „naprawie App Proxy”.
   - **anonymous** + proxy zweryfikowane + brak ID w query → spike **Shopify / typ kont** / czemu proxy nie dopina parametru (to nie jest regresja „samego modelu”).
   - **s2s** → sprawdźcie **dokładnie URL i podpis** żądania vs Liquid.

## Związek z ADR

[`docs/adr/0001-tae-app-proxy-customer-identity.md`](docs/adr/0001-tae-app-proxy-customer-identity.md) nadal obowiązuje: **nie** promujemy `customer_id_hint` do tożsamości. Natomiast **jeśli log pokaże `customer`**, problem powitania po imieniu **musi** być szukany w promptcie / pierwszej turze / modelu — zgodnie z Twoją intuicją „kiedyś działało”.

## Opcje implementacyjne (po rozstrzygnięciu kroku 3 powyżej)

- **Gałąź „customer w logach”:** dostroić prompt / parametry modelu; opcjonalnie **spersonalizować GREETING PREFILTER** gdy znane jest imię (zmiana w kodzie).
- **Gałąź „brak customer w logach”:** spike konfiguracji Shopify i kanału kont — **nie** kolejna zmiana modelu „w ciemno”.

---

## To-dos (zaktualizowane)

- [ ] **Jednorazowa walidacja:** jedno żądanie z motywu + zapis `chat.ingress.customer_context` → wpisanie do ticketa która gałąź decyzyjna z tabeli powyżej.
- [ ] Jeśli gałąź **customer:** przejrzeć prefiltr powitań + pierwszą turę streamu i regresję modelu.
- [ ] Jeśli gałąź **anonymous/s2s:** spike Shopify/proxy/sklep — bez mieszania z wyborem modelu do czasu potwierdzenia logów.
