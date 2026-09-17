# Shopify Flow × własny stos EPIR (bez Klaviyo)

**Status:** materiał roboczy — instrukcja operatorska.  
**Kod:** `workers/analytics` webhooki + proxy przez `workers/chat` (`asystent.epirbizuteria.pl`).  
**Deploy:** tylko po OK operatora (`epir-no-live-without-approval`).

## Publiczne URL (po deployu analytics + chat)

| Flow | Method | URL |
|------|--------|-----|
| #2 Porzucony checkout | `POST` | `https://asystent.epirbizuteria.pl/webhooks/checkout/abandoned` |
| #4 VIP | `POST` | `https://asystent.epirbizuteria.pl/webhooks/customers/vip` |

Nagłówek auth (Shopify Flow → Send HTTP request):

```
X-EPIR-FLOW-SECRET: <ta sama wartość co SHOPIFY_WEBHOOK_SECRET workera analytics>
```

(Alternatywa: `X-Shopify-Hmac-Sha256` jak przy klasycznym webhooku Admin.)

## Flow #7 — Review (zero kodu, tylko Admin)

1. Shopify Admin → **Flow** → Create.
2. Trigger: **Order fulfilled**.
3. Action: **Wait** → 7 days.
4. Action: Judge.me **Send review request** (lub Shopify Email z linkiem do review).
5. Save + turn on.

Nie wymaga deployu workerów.

## Flow #2 — Checkout abandoned

1. Trigger: **Checkout abandoned** (lub równoważny w Twoim planie Shopify).
2. Action: **Send HTTP request**
   - URL: `https://asystent.epirbizuteria.pl/webhooks/checkout/abandoned`
   - Method: POST
   - Headers: `Content-Type: application/json`, `X-EPIR-FLOW-SECRET: …`
   - Body (przykład — dostosuj liquid Flow):

```json
{
  "customer_id": "{{ customer.id }}",
  "email": "{{ checkout.email }}",
  "checkout_url": "{{ checkout.abandoned_checkout_url }}",
  "cart_total": "{{ checkout.total_price }}",
  "cart_token": "{{ checkout.token }}",
  "line_items": {{ checkout.line_items }}
}
```

3. Efekt w D1 `jewelry-analytics-db`: `customer_events.event_type = checkout_abandoned`.

## Flow #4 — VIP (2+ zamówienia)

1. Trigger: **Order created**.
2. Condition: `customer.orders_count >= 2` (lub Number of orders).
3. Action: **Send HTTP request**
   - URL: `https://asystent.epirbizuteria.pl/webhooks/customers/vip`
   - Headers jak wyżej
   - Body:

```json
{
  "customer_id": "{{ customer.id }}",
  "orders_count": "{{ customer.orders_count }}"
}
```

4. Efekt: tabela `customer_vip` + `customer_events.event_type = vip_customer`.

**Uwaga:** `memory_facts` jest w D1 czatu (`ai-assistant-sessions-db`). VIP zapisujemy w analytics (journey / Kustosz). Most do `memory_facts` = osobny krok po naprawie Gemmy.

## Kolejność wdrożenia

1. Flow #7 w Admin (dziś, bez deploy).
2. Deploy `epir-analityc-worker` + worker czatu (proxy) — **tylko po Twoim OK**.
3. Flow #2 i #4 w Admin z URL powyżej.
4. Smoke: jedno testowe HTTP z secret → `SELECT` na `customer_events` / `customer_vip`.
