# Operator Studio ↔ Blender_assist (materiał roboczy)

**Status:** materiał roboczy (nie kanon `docs/README.md`). SSOT protokołu HTTP: [Blender_assist `docs/BLENDER_BRIDGE_HTTP.md`](https://github.com/EPIRjewelry/Blender_assist/blob/main/docs/BLENDER_BRIDGE_HTTP.md).

## Problem

OpenRouter w Operator Studio nie ma dostępu do stdio MCP Blender w Cursorze. Most HTTP + proxy w `workers/chat` łączy te warstwy.

## Polityka sekretów (wiążąca dla tego projektu)

- **Zero nowych nazw** sekretów w Cloudflare.
- Auth relay: reuse `EPIR_OPERATOR_PANEL_SECRET` (już w Secret Store workera czatu).
- URL mostka: **`BLENDER_BRIDGE_ORIGIN`** — wyłącznie `[vars]` w `workers/chat/wrangler.toml`, nie secret.
- Brak sekretów w HTML panelu, Pages, repo.

## Przepływ

1. Grafik: Operator Studio → model OpenRouter → tool call `blender_*`
2. Worker: `POST {BLENDER_BRIDGE_ORIGIN}/v1/tools/{name}` + Bearer = `EPIR_OPERATOR_PANEL_SECRET`
3. PC: relay `127.0.0.1:9876` → addon TCP `8765` → Blender 5.1

## Bramki

| Faza | ESOG przed kolejną fazą |
|------|-------------------------|
| 0 Kontrakt + allowlist | Wymagany PASS |
| 1 Relay (Blender_assist) | Wymagany PASS |
| 2 Proxy (workers/chat) | Wymagany PASS |
| 3 UX Studio | Wymagany PASS |
| Deploy | Wymagany PASS + var origin |

## Uruchomienie (sesja grafika — jeden klik)

**Setup raz:** `Blender_assist/scripts/setup-blender-bridge-once.ps1` + `.env` z `EPIR_OPERATOR_PANEL_SECRET` (ta sama wartość co Operator Studio).

**Codziennie:**

1. Blender → sidebar **Blender MCP** → **Start MCP Bridge** — addon uruchamia TCP `:8765`, relay `:9876` i named tunnel (`bridge_orchestrator.py` w Blender_assist).
2. Operator Studio → zakładka **Blender** → status mostu (auto-odświeżanie).

**Fallback CLI:** `scripts/start-blender-bridge.ps1` — tylko diagnostyka, bez Blendera.

**Nie używać** quick tunnel (`cloudflared tunnel --url`, `*.trycloudflare.com`) — losowy URL wymagałby ponownego deploy workera.

## Uruchomienie lokalne (skrót)

Zob. powyżej; SSOT skryptów: repo Blender_assist `scripts/`.

## Powiązane

- [`docs/PROJECT_B_SOLO_DEV_AGENTS.md`](PROJECT_B_SOLO_DEV_AGENTS.md)
- [`docs/EPIR_WORKSPACE_MAP.md`](EPIR_WORKSPACE_MAP.md)
