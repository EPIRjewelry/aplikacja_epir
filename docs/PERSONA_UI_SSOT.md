# Persona UI vs prompt systemowy (SSOT)

## Cel

Buyer-facing persona (**Gemma**) jest opisana w promptach produkcyjnych (np. `workers/chat/src/prompts/luxury-system-prompt.ts`) i w dokumentach nadrzędnych (`EPIR_AI_ECOSYSTEM_MASTER.md`, rola **Gemma**). Teksty widoczne w UI (nagłówek panelu, pusty stan, strona `/chat`) muszą być **spójne z tą postacią**, ale **nie** powielać ani nie wysyłać do przeglądarki pełnego promptu systemowego.

## Kontrakt w kodzie

- Typ **`PersonaUi`** (`displayName`, `chatTitle`, opcjonalnie `emptyState`, `locale`) — `packages/ui/src/persona-ui.ts`.
- **`DEFAULT_PERSONA_UI`** — domyślne wartości dla persony Gemma; używane w loaderach Hydrogen (kazka, zareczyny) i przekazywane do **`ChatWidget`** jako `personaUi`.
- **Theme App Extension** (`extensions/asystent-klienta/`) — domyślne ustawienia schematu są nazwane i tekstowo zgodne z tym samym kontraktem (tytuł panelu, powitanie); merchant nadal może nadpisać w edytorze motywu.

## Metaobject / SSOT w Shopify — wyłącznie „UI persona config”

Relacyjny metaobject (lub równoważny SSOT w Shopify) **nie** przechowuje pełnego system promptu ani logiki decyzyjnej agenta. Przechowuje **wyłącznie metadane interfejsu** — teksty i sygnały biznesowe przeznaczone do wyświetlenia lub do bezpiecznego wstrzyknięcia jako **krótkie zmienne** po stronie backendu.

Przykładowe pola (nazewnictwo orientacyjne):

| Pole (metaobject) | Rola |
|-------------------|------|
| `assistant_display_name` | Imię / etykieta asystenta w UI |
| `chat_title` | Tytuł panelu czatu |
| `empty_state_headline` | Nagłówek pustego stanu (jeśli rozdzielamy od body) |
| `empty_state_body` | Treść pustego stanu |
| Opcjonalnie: tagi tonu (`luxury`, `casual`, …) | **Sygnały biznesowe**, nie pełny opis zachowania — backend mapuje je na fragmenty instrukcji, nie udostępnia ich jako „promptu” w Storefront ani w bundlu klienta |

**Storefront / Hydrogen / TAE** czytają z SSOT tylko to, co jest **konfiguracją UI** (nagłówki, etykiety, opcjonalnie krótkie copy marketingowe do wyświetlenia). Nie ma tu miejsca na przeniesienie „całego system promptu” do Shopify ani do klienta.

## Pełny system prompt — wyłącznie worker / backend

**Pełny prompt systemowy** (zasady działania, polityki, zastrzeżenia, instrukcje operacyjne) **pozostaje hermetycznie w warstwie backendowej** (Chat Worker i powiązane moduły). Jest budowany jako:

1. **Rdzeń statyczny** — ustalone instrukcje, polityki, guardrails (kod / wersjonowane artefakty w repozytorium).
2. **Fragmenty dynamiczne** — wstrzykiwane przy wnioskowaniu z dozwolonych pól (np. z metaobjecta: `displayName`, ton, claimy marketingowe), **tylko po stronie serwera**, jako zmienne w szablonie promptu, a nie jako „cały prompt” eksportowany do klienta.

Taki podział to **rozdzielenie odpowiedzialności (Separation of Concerns)**: logika decyzyjna i pełna treść instrukcji nie trafia na frontend; unikamy **wycieku payloadu** (promptu systemowego) do przeglądarki lub publicznego API Storefrontu, przy jednoczesnym możliwym **dynamicznym dopasowaniu** copy biznesowego w treści promptu.

## Zgodność planu z tym wzorcem

**Tak** — plan „przenieść stringi do metaobject / worker config” w kolejnym kroku dotyczy **stringów pod UI i marketing** (oraz bezpiecznych zmiennych do wstrzyknięcia w prompt po stronie workera), **a nie** przeniesienia całego system promptu do metaobjecta, Storefront API w formie jawnego promptu ani do bundla klienta.

Jeżeli w dokumentacji pojawia się sformułowanie „SSOT persony”, należy je rozumieć w powyższym rozróżnieniu: **UI persona config** (Shopify / loader) vs **rdzeń promptu + składanie promptu** (worker).

## Co jest źródłem prawdy

| Warstwa | Źródło prawdy |
|--------|----------------|
| Zachowanie i pełna tożsamość operacyjna modelu | Prompt systemowy w workerze (statyczny rdzeń + dynamiczne wstrzyknięcia) + dokumenty nadrzędne |
| Teksty UI (nagłówki, etykiety, pusty stan) | Obecnie: `DEFAULT_PERSONA_UI` + props z loadera; docelowo: pola typu UI persona config w metaobject, odczyt po stronie serwera |
| Sygnały tonu / marki dla promptu | Metaobject / konfiguracja **tylko jako wejście do workera**, nie jako jawny prompt dla klienta |

## Czego nie robić

- Nie osadzać pełnego system promptu ani sekretów w kliencie.
- Nie traktować metaobjecta jako repozytorium „pełnego promptu systemowego” do odczytu przez Storefront.
- Nie utrzymywać osobnych, rozjeżdżających się stringów „asystent” w wielu miejscach bez wspólnego typu lub propsów.

Jeżeli ten dokument jest sprzeczny z `EPIR_AI_ECOSYSTEM_MASTER.md` lub `EPIR_AI_BIBLE.md`, **wygrywają dokumenty nadrzędne**, a ten plik wymaga aktualizacji.
