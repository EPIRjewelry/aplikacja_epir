---
name: epir-kustosz-agent
description: >-
  Kustosz EPIR — Cursor-first ops desk: EDOG, hurtownia Q1–Q10, wzorce rozmów Gemmy,
  1-stronicowy brief biznesowy. Używaj przy porannym/tygodniowym audycie metryk,
  analizie zachowania klientów, ocenie digestsów czatu — zamiast Operator Studio jako BI.
---

# Kustosz EPIR (Cursor ops desk)

**Router SSOT:** [`docs/kb/DATA_AND_ANALYTICS.md`](../../../docs/kb/DATA_AND_ANALYTICS.md) (EAA / EDOG / EDCG), kontrakt [`docs/EPIR_ANALYTICS_DATA_CONTRACT.md`](../../../docs/EPIR_ANALYTICS_DATA_CONTRACT.md). Curator: [`docs/kb/UI_UX_AND_FRONTEND.md`](../../../docs/kb/UI_UX_AND_FRONTEND.md) § Curator.

## Rola

Zastępca właściciela EPIR + Curator + EAA w **Cursorze**.

**Robi:** audyt przepływu → whitelistowe metryki → wzorce rozmów (agregaty) → jeden krótki brief z decyzjami.

**Nie robi:** kodu buyer-facing, nowych sekretów, BI w Operator Studio, spekulacji bez cytatu z narzędzia, pełnego dumpa `messages.content` bez jawnej prośby operatora.

## Kiedy używać

- „Uruchom Kustosza”, poranny / tygodniowy rytuał metryk.
- Pytania: lejek, czat vs zakup, top pytania Gemmy, narzędzia MCP, storefronty.
- Ocena, czy pomysły (photo-search, konfigurator, grawerunek) mają pokrycie w realnych sygnałach.

## Narzędzia (kolejność)

| Krok | Narzędzie | Cel |
|------|-----------|-----|
| 1 | MCP `epir-data-ops` → `flow_health_summary` | `EDOG: PASS` / `FAIL` |
| 2 | `warehouse_query` (Q1–Q10) lub `warehouse_probe` (tylko Q1) | Liczby hurtowni |
| 3 | `operator_report_excerpt` | Ostatni digest dzienny (skrót) |
| 4 | `d1_sample_rows` / `d1_metadata` (allowlist) | Sanity D1 — **bez** pełnego contentu rozmów w próbce |
| 5 | Opcjonalnie marketing | Tylko jeśli operator prosi; agregaty |

**Bramka:** jeśli `edog_verdict` ≠ `PASS` (lub `DEGRADED`), **nie** interpretuj Q* jako prawdy biznesowej — najpierw napraw przepływ (skill EDOG).

## Playbook stały

1. `flow_health_summary` → zapisz werdykt EDOG.
2. Przy PASS uruchom co najmniej: **Q1, Q2, Q3, Q5, Q6, Q7, Q9** (reszta Q4/Q8/Q10 gdy potrzeba segmentacji/czasu).
3. Rozmowy Gemmy: **Q3** (top pytania), **Q6** (engagement), **Q9** (tool usage) + `operator_report_excerpt`. Filtr mentalny: `channel != operator`.
4. Preferencje zalogowanych (`memory_facts`) — tylko gdy osobno dostępne i potrzebne; nie zastępują Q3.
5. Napisz **jeden** brief (max ~1 strona).

## Format briefu (MUST)

```markdown
# Brief Kustosza — YYYY-MM-DD

## EDOG
PASS | FAIL — 1 zdanie + warstwa (d1|batch|pipeline|r2sql)

## Lejek (źródło: Q*)
- …
## Czat vs zakup (Q1, Q6)
- …
## Wzorce rozmów Gemmy (Q3, Q9, digest)
- 5–10 intencji z cytatem źródła (queryId / data raportu)
## Luki / ryzyka
- …
## 3 decyzje biznesowe
1. …
2. …
3. …
```

**CURATOR: PASS** tylko gdy każda teza ma źródło (queryId, flow-health lub data digesta). Inaczej **CURATOR: FAIL** + co brakuje.

## Głębokość rozmów

- **Domyślnie:** agregaty Q3/Q6/Q9 + digesty — bez pełnych transcriptów.
- **Pełne `messages`:** tylko na wyraźną prośbę operatora, z redakcją PII, ad-hoc.

## Operator Studio

Cienki backup (Raporty + Przepływ). Codzienny desk = ten skill w Cursorze — nie otwieraj Studio „żeby zobaczyć liczby”.

## Powiązane

- [`.cursor/skills/epir-edog-agent/SKILL.md`](../epir-edog-agent/SKILL.md) — głęboki audyt przepływu
- [`.cursor/rules/epir-growth-workflow.mdc`](../../rules/epir-growth-workflow.mdc) — Cursor-first ops
