# Bramka ESOG — Blender ↔ Operator Studio

Każda faza wymaga werdyktu **`ESOG: PASS`** przed rozpoczęciem następnej.

## Faza 0 — Kontrakt + allowlist

| # | Kryterium | PASS jeśli |
|---|-----------|------------|
| 0.1 | SSOT protokołu w Blender_assist | `docs/BLENDER_BRIDGE_HTTP.md` istnieje |
| 0.2 | Brak nowej nazwy sekretu | Dokumentacja wymaga tylko `EPIR_OPERATOR_PANEL_SECRET` + var `BLENDER_BRIDGE_ORIGIN` |
| 0.3 | Allowlist v1 bez `run_script` / `node_tool_invoke` | Jawna tabela w SSOT |
| 0.4 | Pointer w aplikacja_epir | `docs/EPIR_BLENDER_OPERATOR_STUDIO_BRIDGE.md` linkuje SSOT, nie duplikuje kontraktu |
| 0.5 | Kanon | Brak drugiego „prawdziwego” backendu w kanonie README |

**Werdykt Fazy 0 (2026-05-30):**

| # | Wynik |
|---|--------|
| 0.1–0.5 | Zgodne |

```text
ESOG: PASS
```

Uzasadnienie: SSOT w Blender_assist; auth bez nowej nazwy sekretu; allowlist bez destrukcyjnych narzędzi; pointer roboczy w aplikacja_epir; brak rozszerzenia kanonu README.
```

## Faza 1 — Relay HTTP (Blender_assist)

| # | Kryterium |
|---|-----------|
| 1.1 | `relay/` woła istniejące funkcje `mcp_server.server`, nie duplikuje bpy |
| 1.2 | Allowlist enforced na `POST /v1/tools/{name}` |
| 1.3 | Bearer = `EPIR_OPERATOR_PANEL_SECRET` z env |
| 1.4 | `.env` w `.gitignore`; brak wartości sekretu w repo |
| 1.5 | Testy pytest bez Blendera (mock auth / 404) |

**Werdykt Fazy 1 (2026-05-30):**

```text
ESOG: PASS
```

Uzasadnienie: `relay/http_server.py` + allowlist; pytest 5/5; `.env.example` bez wartości; auth jednym sekretem operatora.

## Faza 2 — Proxy workers/chat

| # | Kryterium |
|---|-----------|
| 2.1 | `internal-blender-tools.ts` — fetch + Bearer z `env.EPIR_OPERATOR_PANEL_SECRET` |
| 2.2 | `BLENDER_BRIDGE_ORIGIN` tylko jako var w wrangler.toml |
| 2.3 | Narzędzia tylko `internal-dashboard` |
| 2.4 | Vitest mock fetch |
| 2.5 | Brak `BLENDER_BRIDGE_BEARER` w bindings |

**Werdykt Fazy 2 (2026-05-30):**

```text
ESOG: PASS
```

## Faza 3 — UX Operator Studio

| # | Kryterium |
|---|-----------|
| 3.1 | Status mostka bez nowego pola sekretu w UI |
| 3.2 | Baner `production_blender` z checklistą |
| 3.3 | `mcp-epir.example.json` opcjonalny wpis blender-assist |

**Werdykt Fazy 3 (2026-05-30):**

```text
ESOG: PASS
```

(Uwaga: checklista mostu w panelu bocznym + hint w workflow; pełny baner trybu z `workflow-presets`.)

## Faza 4 — Deploy

| # | Kryterium |
|---|-----------|
| 4.1 | Zero nowych `wrangler secret put` |
| 4.2 | Wpis operacyjny w EPIR_DEPLOYMENT (krótki) |

**Werdykt Fazy 4 (2026-05-30):**

```text
ESOG: PASS
```

## Faza 5 — Ops: named tunnel (stały hostname)

| # | Kryterium | PASS jeśli |
|---|-----------|------------|
| 5.1 | Stały `BLENDER_BRIDGE_ORIGIN` (nie quick tunnel) | `https://blender-bridge.epirbizuteria.pl` w wrangler + deploy |
| 5.2 | Skrypty ops w Blender_assist | `setup-blender-bridge-once.ps1`, `start-blender-bridge.ps1` |
| 5.3 | `.cloudflared/` w gitignore | Brak credentials w repo |
| 5.4 | Smoke E2E | Public `/health` + worker `blender-bridge-health` → `online: true` |
| 5.5 | Zero nowych sekretów CF | Bez `wrangler secret put` dla mostu |

**Werdykt Fazy 5 (2026-05-30):**

| # | Wynik |
|---|--------|
| 5.1 | `BLENDER_BRIDGE_ORIGIN` = `https://blender-bridge.epirbizuteria.pl`; deploy `d243cab2-d8b9-455f-bcc8-ee1fc2d093ab` |
| 5.2 | Skrypty setup + start (relay + named tunnel) |
| 5.3 | `.cloudflared/` gitignore w Blender_assist |
| 5.4 | Smoke: public health OK; worker `{"configured":true,"online":true}` |
| 5.5 | Bez nowych nazw sekretów |

```text
ESOG: PASS
```

Uzasadnienie: stały hostname eliminuje deploy przy restarcie PC; auth bez nowej nazwy sekretu; ops tylko skryptami lokalnymi.
