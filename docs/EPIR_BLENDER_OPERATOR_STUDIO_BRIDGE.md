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

## Uruchomienie (3 kroki — codziennie)

**Setup raz:** `Blender_assist/scripts/setup-blender-bridge-once.ps1` (named tunnel → stały `https://blender-bridge.epirbizuteria.pl`; `.env` z `EPIR_OPERATOR_PANEL_SECRET` — ta sama wartość co w Operator Studio). Worker: `BLENDER_BRIDGE_ORIGIN` w [`workers/chat/wrangler.toml`](../workers/chat/wrangler.toml) — deploy **tylko przy zmianie hostname**.

**Sesja grafika:**

1. Blender → addon → **Start MCP Bridge** (port 8765).
2. `.\scripts\start-blender-bridge.ps1` — relay `:9876` + named tunnel w tle.
3. Operator Studio → panel **Most Blender** → status online; narzędzie `blender_bridge_invoke`.

**Nie używać** quick tunnel (`cloudflared tunnel --url`, `*.trycloudflare.com`) — losowy URL wymagałby ponownego deploy workera.

## Uruchomienie lokalne (skrót)

Zob. powyżej; SSOT skryptów: repo Blender_assist `scripts/`.

## Powiązane

- [`docs/PROJECT_B_SOLO_DEV_AGENTS.md`](PROJECT_B_SOLO_DEV_AGENTS.md)
- [`docs/EPIR_WORKSPACE_MAP.md`](EPIR_WORKSPACE_MAP.md)
