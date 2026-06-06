# UI, UX i Frontend EPIR

Moduł wiedzy dla Hydrogen, Theme App Extension, widgetu czatu, Liquid i warstwy marki. Szczegóły wizualne i PR review: [`REVIEW.md`](../../REVIEW.md).

## Marka i design system (skrót)

- **Art Jewellery** — unikat, rzemiosło + projektowanie 3D; UI wspiera transparentność procesu.
- **Paleta:** ziemiste beże, ecru, ciepłe szarości; akcent per kolekcja (HEX, np. `#2c684e`).
- **Layout:** dużo negative space; ciepłe/neutralne światło w CSS; bez zimnych, przesyconych tonów.
- **Media:** 2048×2048 px; lifestyle bez czystego białego tła; `stone_profile` na karcie produktu.
- **Collection enhanced:** metafields — Hero Video, Texture Overlay, Process Image, Lookbook, Artist Photo, Accent Color.

→ Pełne wytyczne: [`REVIEW.md`](../../REVIEW.md).

## Orthodoksia frontendu (ESOG)

**MUST:**

- Frontend = tylko UI + klient API (Theme, Hydrogen, extensions).
- Brak Admin API, tokenów admin, logiki AI i sekretów w bundle klienta.
- Storefront API przez `createStorefrontClient`; czat przez App Proxy lub BFF (nie bezpośredni S2S z przeglądarki).
- Każde żądanie czatu: `storefrontId` + `channel` w payloadzie.
- Stan rozmowy: backend (SessionDO + D1); frontend tylko UI state; po odświeżeniu `GET /history`.

**MUST NOT:**

- Wstrzykiwanie `X-EPIR-*` ani shared secret do kodu klienta.

## Hydrogen (kazka, zareczyny)

- Dwa brandy, jeden backend — osobne `storefrontId`, env, persona.
- **Ingress czatu:** przeglądarka → same-origin `POST /api/chat` (Remix) → S2S `POST https://asystent.epirbizuteria.pl/chat` z `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL`.
- Wspólna logika: preferuj `packages/utils` (`hydrogen.ts`, `chat-*`) — nie duplikuj `app/lib/*.ts`.
- W aplikacji zostaje: Header/Footer/Hero, kolory, `NAV_HANDLE_ORDER`, `INFO_LINKS`, copy marki, env per app.
- Default `BRAND` w kazka = **`kazka`**, nie `zareczyny`.

## Liquid / Online Store 2.0

- `image_url` + `image_tag` z wymiarami — **nie** `img_url` / `img_tag`.
- Nowe szablony: format JSON (OS 2.0); unikaj surowego JS w Liquid.
- Brak lorem ipsum — weryfikuj względem dokumentacji Shopify (Dev MCP).

## Widget czatu (asystent-klienta)

**Stany:** launcher (domyślny) → panel otwarty (`is-open`) → zamknięty (`is-closed`, launcher widoczny).

**MUST:**

- Po wejściu na stronę: dyskretny launcher (prawy dolny róg); panel ukryty.
- Klik launcher → otwiera panel; „X” → zamyka panel, launcher zostaje.
- Panel: `position: fixed; bottom: 24px; right: 24px; max-width: ~380px; max-height: ~560px`.

**MUST NOT:**

- Pełny panel jako default na wejściu.
- Ukrycie launchera bez świadomego wyjątku (edytor motywu, merchant wyłącza czat).

Pliki: `extensions/asystent-klienta/blocks/*.liquid`, `assets/assistant.css`, `assistant-runtime.js`.

## Role AI buyer-facing

| Rola | Zakres |
|------|--------|
| **Gemma** | Kupujący — język luksusowy, doradztwo, koszyk; blokada tematów technicznych |
| **Dev-asystent** | Wewnętrzny — analityka, SQL, architektura (Project B) |

## Curator (meta-narrator Project B)

- Łączy sygnały Store Steward, HAM, marketing preview — **nie** zastępuje Gemmy ani Kustosza.
- Synteza biznesowa po PASS bramek HAM/EDOG; jawne hipotezy, bez zmyślania metryk.
- Nie edytuje `workers/chat` bez EFA.

**Werdykty:** `CURATOR: PASS` | `CURATOR: FAIL`

**Kiedy:** po etapie HAM (A–D) lub audycie tygodniowym — nie w każdej turze kodu.

## Tone of voice (UI copy)

- CTA i powiadomienia: merytoryczne, bez ozdobników.
- Ekspozycja danych gemmologicznych (Mohs, próba 585) w UI tam, gdzie produkt to wspiera.
- Doradztwo eksperckie, nie „sprzedaż masowa”.

## Dokumenty kanoniczne (głębokość techniczna)

- [`docs/EPIR_INGRESS_AND_RUNTIME.md`](../EPIR_INGRESS_AND_RUNTIME.md)
- [`EPIR_AI_ECOSYSTEM_MASTER.md`](../../EPIR_AI_ECOSYSTEM_MASTER.md) — model kanałów i agentów
