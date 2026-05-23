# Merge gate: EDOG — wdrożenie strażnika przepływu danych

**Strażnik:** **EDOG** (EPIR Data Operations Guardian) — skill [`.cursor/skills/epir-edog-agent/SKILL.md`](../../.cursor/skills/epir-edog-agent/SKILL.md)

**Uzupełnia (nie zastępuje):** **EDCG** — kontrakt w repo ([`WAREHOUSE_DATA_CONTRACT.md`](WAREHOUSE_DATA_CONTRACT.md))

## Zasada PASS (obowiązkowa)

Każdy **krok implementacji** poniżej jest uznany za zakończony **dopiero gdy** w recenzji (chat, PR, notatka operatora) pojawi się dokładnie:

```text
EDOG: PASS
```

- **`EDOG: FAIL`** lub **`EDOG: DEGRADED`** — **nie** przechodź do następnego kroku; popraw i powtórz audyt **tego samego** kroku.
- Implementator (ludzki lub agent) uruchamia kolejny krok **wyłącznie** po `EDOG: PASS` na poprzednim.

Werdykt operacyjny produkcji: `GET /internal/flow-health` na `epir-bigquery-batch` (Bearer `DATA_GUARDIAN_OPS_KEY`) — pole `edog_verdict` musi być `PASS` przed krokiem 7+ w produkcji.

---

## Kroki (kolejność ścisła)

| Krok | Zakres | Artefakty | Warunek wejścia |
|------|--------|-----------|-----------------|
| **1** | Mapa przepływu | [`docs/EPIR_DATA_FLOW_MAP.md`](../EPIR_DATA_FLOW_MAP.md) | — |
| **2** | Definicja agenta | `epir-edog-agent/SKILL.md`, `.github/agents/data-operations-guardian.agent.md`, rejestracja w README/AGENTS | **Krok 1:** `EDOG: PASS` |
| **3** | Runtime health | `workers/bigquery-batch/src/edog-flow-health.ts`, `GET /internal/flow-health` | **Krok 2:** `EDOG: PASS` |
| **4** | MCP read-only | `mcp-servers/epir-data-ops/`, `.cursor/mcp-data-ops.example.json` | **Krok 3:** `EDOG: PASS` (+ smoke `flow-health` lokalnie/staging jeśli dostępne) |
| **5** | Cron + KV (koszt 2×/dobę) | `wrangler.toml` crony `0 8,20 * * *`, opcjonalny `DATA_GUARDIAN_KV`, secret `DATA_GUARDIAN_OPS_KEY` | **Krok 4:** `EDOG: PASS` |
| **6** | Operator Studio | `data_flow_audit` w `workflow-presets.ts`, `PROJECT_B_SOLO_DEV_AGENTS.md` | **Krok 5:** `EDOG: PASS` |
| **7** | CI statyczne | `scripts/ci/validate-data-flow-map.py`, vitest `edog-flow-health`, krok w `deploy.yml` | **Krok 6:** `EDOG: PASS` |
| **8** | (Opcjonalnie) Most do `epir_analityc` | callable / docs w `epir-marketing-agent-service` | **Krok 7:** `EDOG: PASS` |

---

## Audyt kroku (checklist dla agenta EDOG)

Przy każdym kroku agent EDOG sprawdza **tylko** artefakty tego kroku i wydaje `EDOG: PASS` lub `EDOG: FAIL` (+ `reasons[]`).

Nie implementuje kodu następnego kroku.

---

## Koszt monitoringu (krok 5)

- Cron **tylko** `0 8 * * *` i `0 20 * * *` UTC (2×/dobę), osobno od eksportu `0 2 * * *`.
- Na przebieg: kilka `COUNT` D1 + **co najwyżej jedno** R2 SQL (`Q1_CONVERSION_CHAT`) gdy batch nie jest w stanie `FAIL`.
- Brak zapisu do Pipelines/Iceberg z crona monitoringu.

---

## Powiązanie z konsumentami danych

| Konsument | Po `EDOG: PASS` na kroku 3+ |
|-----------|------------------------------|
| `internal_analytics` / `run_analytics_query` | Zalecany audyt `flow-health` przed interpretacją; **bez** twardej blokady w czacie (domyślnie `EDOG_GATE_ENABLED=false`) |
| `epir_analityc` | Hurtownia pixel poza zakresem sidecara; audyt marketingu osobno (`fetch_marketing_preview`) |
