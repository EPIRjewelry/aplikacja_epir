# EDOG — EPIR Data Operations Guardian

**Router SSOT** — nie duplikuj kontraktu tutaj. Kanon: [`docs/kb/DATA_AND_ANALYTICS.md`](../../../docs/kb/DATA_AND_ANALYTICS.md) § EDOG, mapa [`docs/EPIR_DATA_FLOW_MAP.md`](../../../docs/EPIR_DATA_FLOW_MAP.md), bramka [`docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md`](../../../docs/merge-gates/EDOG_IMPLEMENTATION_STEPS.md).

## Kiedy używać

- Audyt zdrowia przepływu D1 → batch → R2/Iceberg przed interpretacją metryk.
- Weryfikacja kroku wdrożenia EDOG (`EDOG: PASS` / `EDOG: FAIL`).
- Operator Studio tryb `data_flow_audit` (po PASS flow-health).

## Narzędzia

| Narzędzie | Cel |
|-----------|-----|
| MCP `epir-data-ops` | Read-only D1 + `flow_health_summary` |
| `GET /internal/flow-health` | `epir-bigquery-batch` — pole `edog_verdict` |
| Operator Studio proxy | `GET /internal/operator-studio/api/flow-health` (alias solo-dev) |

## Werdykt

- Produkcja: `edog_verdict` musi być `PASS` przed krokami 7+ (EDOG gate doc).
- `DEGRADED` traktuj jako `FAIL` dla bramki merge.
- Nie implementuj kolejnego kroku EDOG bez jawnego `EDOG: PASS` na poprzednim.

## Powiązane reguły Cursor

- [`.cursor/rules/epir-edog-guardian.mdc`](../../rules/epir-edog-guardian.mdc)
