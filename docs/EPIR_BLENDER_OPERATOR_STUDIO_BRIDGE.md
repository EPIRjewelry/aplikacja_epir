# Operator Studio ↔ Blender_assist (materiał roboczy)

**Status:** materiał roboczy (nie kanon `docs/README.md`). SSOT protokołu HTTP: [Blender_assist `docs/BLENDER_BRIDGE_HTTP.md`](https://github.com/EPIRjewelry/Blender_assist/blob/main/docs/BLENDER_BRIDGE_HTTP.md).

## Problem

OpenRouter w Operator Studio nie ma dostępu do stdio MCP Blender w Cursorze. Most HTTP + proxy w `workers/chat` łączy te warstwy.

## Polityka sekretów

- **Zero nowych nazw** sekretów w Cloudflare.
- **Jeden klucz operatora:** `EPIR_OPERATOR_PANEL_SECRET` — tylko logowanie do Operator Studio (Secret Store workera czatu).
- **URL mostka:** `BLENDER_BRIDGE_ORIGIN` = `https://blender-bridge.epirbizuteria.pl` — już w [`workers/chat/wrangler.toml`](../workers/chat/wrangler.toml) `[vars]`, operator **nie wpisuje** tego ręcznie.
- **Relay na PC:** domyślnie **bez** Bearer (`RELAY_AUTH=0`). Brak sekretu w `.env` na PC.

## Przepływ

1. Grafik: Operator Studio → model OpenRouter → tool call `blender_bridge_invoke`
2. Worker: `POST {BLENDER_BRIDGE_ORIGIN}/v1/tools/{name}` (bez Authorization do relay)
3. PC: named tunnel → relay `127.0.0.1:9876` → addon TCP `8765` → Blender 5.1

## Uruchomienie (sesja grafika)

**Setup raz:** `Blender_assist/scripts/setup-blender-bridge-once.ps1` (tunel + venv). Opcjonalnie `copy .env.example .env`.

**Codziennie:**

1. Operator Studio — klucz `EPIR_OPERATOR_PANEL_SECRET` (jak dotąd).
2. Blender → **Start MCP Bridge**.
3. Studio → zakładka **Blender** → status mostu.

**Fallback CLI:** `scripts/start-blender-bridge.ps1` — diagnostyka.

**Nie używać** quick tunnel (`trycloudflare.com`).

## Powiązane

- [`docs/PROJECT_B_SOLO_DEV_AGENTS.md`](PROJECT_B_SOLO_DEV_AGENTS.md)
- [`docs/EPIR_WORKSPACE_MAP.md`](EPIR_WORKSPACE_MAP.md)
