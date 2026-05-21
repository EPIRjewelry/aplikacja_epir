# Project B — agenci i modele (solo-dev-chat)

Panel: `GET /internal/solo-dev-chat` na workerze czatu (`epir-art-jewellery-worker`).

## Nagłówki

| Nagłówek | Znaczenie |
|----------|-----------|
| `X-Admin-Key` | `EPIR_OPERATOR_PANEL_SECRET` — auth operatora |
| `X-EPIR-AGENT-PRESET` | Rola agenta (patrz tabela poniżej) |
| `X-Epir-Model-Variant` | Klucz wariantu z `workers/chat/src/config/model-params.ts` (`or_*` = OpenRouter) |

Presety agenta: kod źródłowy [`workers/chat/src/solo-dev-agent-presets.ts`](../workers/chat/src/solo-dev-agent-presets.ts).

## Agenci (lista rozwijana)

| ID | Grupa | Domyślny model (variant) |
|----|-------|---------------------------|
| `internal_analytics` | Operacje | `default` (Groq GPT-OSS-120B) |
| `creative_svg` | Projektowanie | `or_claude_sonnet_4` |
| `creative_copy` | Projektowanie | `or_gpt4o_mini` |
| `creative_image` | Projektowanie | `or_recraft_v41_utility_vector` |
| `creative_blender_flow` | Projektowanie | `or_gpt4o` |

Pod listami **Agent** i **Model** panel pokazuje krótkie opisy (`uiHint` w presetach + mapa modeli) — aktualizują się przy zmianie wyboru.

**Uwaga:** ścieżka produkcyjna analityki to **D1 → Pipelines → Iceberg → R2 SQL**, nie Google BigQuery (nazwa `epir-bigquery-batch` jest historyczna).

## Modele OpenRouter

Warianty `or_*` mapują na `openrouter/<slug>` w [`model-params.ts`](../workers/chat/src/config/model-params.ts).

### Recraft V4.1 (generacja obrazu / SVG)

| Klucz UI | Slug OpenRouter |
|----------|-----------------|
| `or_recraft_v41` | `recraft/recraft-v4.1` |
| `or_recraft_v41_vector` | `recraft/recraft-v4.1-vector` |
| `or_recraft_v41_pro` | `recraft/recraft-v4.1-pro` |
| `or_recraft_v41_pro_vector` | `recraft/recraft-v4.1-pro-vector` |
| `or_recraft_v41_utility` | `recraft/recraft-v4.1-utility` |
| `or_recraft_v41_utility_vector` | `recraft/recraft-v4.1-utility-vector` |
| `or_recraft_v41_utility_pro` | `recraft/recraft-v4.1-utility-pro` |
| `or_recraft_v41_utility_pro_vector` | `recraft/recraft-v4.1-utility-pro-vector` |

Worker wysyła `modalities: ["image"]` dla modeli Recraft (`imageGen` w `model-params.ts`) — bez narzędzi MCP w tej turze. Odpowiedź może zawierać pole SSE `images` z data URL.

### Tekst (dodatkowo)

- `or_claude_sonnet_4` → `anthropic/claude-sonnet-4`
- `or_gpt41` → `openai/gpt-4.1`

## UI panelu (wątek, załączniki, skróty)

- **Wątek:** `#thread` — wszystkie tury user/assistant; po odświeżeniu strony historia z `POST /internal/solo-dev-chat/api/history` (SessionDO).
- **Załącznik:** jeden obraz na wiadomość (`image_base64` w body czatu), max **4 MB**, podgląd przed wysłaniem; wymaga modelu **multimodal** lub Recraft.
- **Enter** — wyślij; **Shift+Enter** — nowa linia w polu wiadomości.
- **Nowa rozmowa** — czyści `session_id` w `sessionStorage` (kolejna wiadomość = nowa sesja).
- Stare wiadomości z obrazem w historii API: tekst `(załącznik obrazu)` (miniatury z D1 nie są odtwarzane w v1).

## Workflow projektowy (operator)

1. **SVG / Flow** — agent `creative_svg` → eksport SVG → import w Blenderze (curve).
2. **Reklama** — `creative_copy` + `creative_image` (multimodal przy załączniku).
3. **Mesh** — `creative_blender_flow` + Blender MCP (osobne narzędzie), nie zastępuje DTP.
