# Raport naprawy czatu – widget i Hydrogen

**Data:** 2026-03-05  
**Problem:** Widget na stronie sklepu i czaty Hydrogen (Kazka, Zareczyny) nie zwracały odpowiedzi.

---

## 1. Diagnoza

### 1.1 Czaty Hydrogen (Kazka, Zareczyny)

**Przyczyna:** Błędna logika w `packages/ui/src/ChatWidget.tsx`.

- Warunek `chatApiUrl.includes('/apps/assistant/chat')` powodował, że dla URL `https://asystent.epirbizuteria.pl/chat` ustawiano `isMcp = false`.
- Przy `isMcp = false` ChatWidget wysyłał:
  - **Body:** `{message, anonymousId, cartId}` zamiast `{message, session_id, cart_id, brand, stream}`
  - **Accept:** `application/json` zamiast `text/event-stream`
- Worker **zawsze** zwraca odpowiedź w formacie **SSE (text/event-stream)**.
- Klient przy `isMcp = false` wywoływał `res.json()` na strumieniu SSE → parsowanie JSON się nie udawało → błąd „No reply from server”.

### 1.2 Widget na stronie sklepu (extensions/asystent-klienta)

Widget (`assistant.js`) był poprawnie skonfigurowany:
- Wysyła `{message, session_id, cart_id, brand, stream: true}`
- Oczekuje SSE i poprawnie go parsuje

Jeśli widget nie działa, możliwe przyczyny to:
- Brak odpowiedzi z endpointu (np. brak `GROQ_API_KEY`, problemy z siecią)
- CORS – domena sklepu musi być w `ALLOWED_ORIGINS` (obecnie: epirbizuteria.pl, myshopify.com, kazka, zareczyny)

---

## 2. Wprowadzone poprawki

### packages/ui/src/ChatWidget.tsx

- Usunięto warunek `isMcp` – ChatWidget zawsze używa formatu zgodnego z workerem.
- Zawsze wysyłane jest: `{message, session_id, cart_id, brand, stream: true}`.
- Zawsze ustawiane jest: `Accept: text/event-stream, application/json`.
- Zawsze parsowany jest strumień SSE (niezależnie od URL).

---

## 3. Kroki wdrożenia

1. **Przebuduj aplikacje Hydrogen** (pakiet @epir/ui nie ma skryptu build – jest kompilowany przez Remix):
   ```powershell
   cd D:\aplikacja_epir\apps\kazka
   npm run build

   cd D:\aplikacja_epir\apps\zareczyny
   npm run build
   ```

2. **Wdróż Hydrogen Pages:**
   ```powershell
   cd D:\aplikacja_epir\apps\kazka
   wrangler pages deploy public --project-name=kazka-hydrogen-pages

   cd D:\aplikacja_epir\apps\zareczyny
   wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
   ```

3. **Sprawdź sekrety workera czatu:**
   ```powershell
   cd D:\aplikacja_epir\workers\chat
   wrangler secret list
   ```
   Wymagane: `GROQ_API_KEY`, `SHOPIFY_APP_SECRET`, opcjonalnie `ADMIN_KEY`.

4. **Test endpointu:**
   ```powershell
   curl -X POST "https://asystent.epirbizuteria.pl/chat" -H "Content-Type: application/json" -d "{\"message\":\"Czesc\",\"stream\":true}"
   ```
   Oczekiwana odpowiedź: strumień SSE z eventami `session`, `data` (delta), `[DONE]`.

---

## 4. Weryfikacja

- **Hydrogen:** https://kazka.epirbizuteria.pl/chat i https://zareczyny.epirbizuteria.pl/chat – wysłanie wiadomości powinno zwrócić odpowiedź asystenta.
- **Widget:** Sklep Shopify z dodaną sekcją „Asystent Klienta AI” – czat powinien działać po stronie sklepu.
