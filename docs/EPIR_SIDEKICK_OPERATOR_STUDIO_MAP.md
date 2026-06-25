# Sidekick → Operator Studio (Faza 5)

Mapowanie funkcji **Shopify Sidekick** (admin AI) na istniejący **Operator Studio** + Admin API. **Nie** budujemy duplikatu Sidekick w `workers/chat`.

## Zasada

| Sidekick (merchant) | EPIR (już w repo) |
|---------------------|-------------------|
| Pytania o sprzedaż / KPI | Operator Studio + `workers/analyst-worker` |
| Status zamówień klienta | Gemma `get_most_recent_order_status` (buyer-facing) |
| Edycja produktów / metafields | Admin GraphQL + checklist [EPIR_ADMIN_METAFIELDS_CHECKLIST.md](./EPIR_ADMIN_METAFIELDS_CHECKLIST.md) |
| Marketing / kampanie | Shopify Admin natywnie — nie w workerze |
| Flow / automatyzacje | Shopify Flow — poza repo |

## Operator Studio — zakres

- **Ingress:** `workers/chat` → `/operator-studio` (static + API)
- **Sekret:** `EPIR_OPERATOR_PANEL_SECRET`
- **Use cases:** leady, podgląd sesji, marketing ops preview (gdy włączone)

## Rekomendowany rollout Sidekick alignment

1. **Buyer-facing parity** (Fazy 0–3) — zamknięte przed inwestycją w admin AI.
2. **Operator Studio** — rozszerzaj o read-only widoki z Admin API zamiast kopiowania Sidekick UI.
3. **Shopify AI Toolkit** (opcjonalnie) — tylko dla operatora w Admin; Gemma pozostaje na storefrontach.

## Czego nie robić

- Nie dodawaj endpointu „Sidekick proxy” w `workers/chat`.
- Nie mieszaj promptów buyer-facing Gemma z promptami operatora.
- Nie duplikuj Catalog API w Operator Studio — discovery zostaje na storefrontach.

## Następne kroki (gdy operator zdecyduje)

1. Lista 3–5 zapytań Sidekick, które operator powtarza → mapa na istniejące API Studio.
2. Jedna integracja Admin GraphQL na zapytanie (np. inventory snapshot).
3. Dokumentacja w [EPIR_DEPLOYMENT_AND_OPERATIONS.md](./EPIR_DEPLOYMENT_AND_OPERATIONS.md) — sekcja Operator.
