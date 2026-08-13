# Zamrożenie — strona zamówienia indywidualnego

**Data:** 2026-08-12  
**Decyzja:** operator — architektura i UI uznane za doskonałe na ten moment.  
**Status:** ZAMROŻONE

## Zakaz

Bez **bardzo wyraźnego polecenia operatora** w sesji pracy:

- żadnych zmian estetycznych (layout, copy, kolory, typografia, UX),
- żadnych zmian kodowych (Liquid, JS, worker `cocreate`, testy, deploy).

## Zakres techniczny

| Element | Lokalizacja |
|---------|-------------|
| Strona kanoniczna | `https://epirbizuteria.pl/pages/zaprojektuj-swoj-model` |
| Sekcja motywu | `themes/epir-online-store/sections/zaprojektuj-swoj-model.liquid` |
| Szablon strony | `themes/epir-online-store/templates/page.zaprojektuj.json` |
| API briefu | `POST /apps/assistant/cocreate` → `workers/chat/src/cocreate/` |
| Załącznik | `attachment_base64` + `attachment_filename` (App Proxy-safe) |
| Storage | R2 `epir-cocreate-uploads`, D1 `cocreate_briefs` |

## Stan wdrożenia (referencja)

- Worker: `epir-art-jewellery-worker` (deploy 2026-08-12)
- Motyw live: `#186221691212` — sekcja `zaprojektuj-swoj-model.liquid`

## Reguła agenta

Cursor: `.cursor/rules/epir-cocreate-order-freeze.mdc`
