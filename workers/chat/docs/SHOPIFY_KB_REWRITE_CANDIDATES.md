# Shopify Knowledge Base — kandydaci do przepisania (copy 2. osoby / założony kontekst)

**Status:** lista robocza dla operatora (Krzysztof). **Bez edycji live Admin** w tym PR.

Źródło diagnozy: smoke S-E/S-F (2026-10-23, 2026-10-25) — odpowiedzi KB zawierały m.in. frazy typu „Twój projekt 3D pierścionka, który pokazałeś wcześniej” / „przesłania tego pliku”. W repozytorium `workers/chat` tych fraz nie ma; pochodzą z treści FAQ w Shopify KB.

## Kryteria (kontrakt w kodzie)

Wpisy odrzucane w runtime (`kb.entry_rejected`, `kb-selection.ts`) gdy treść zakłada wcześniejszą rozmowę lub plik od klienta:

- „pokazałeś / pokazała”
- „wcześniej pokaza / wspomnia / przesła”
- „ten plik”
- „twój projekt”
- „przesłałeś”
- „projekt 3D” (w kontekście czatu 1:1)

## Kandydaci do audytu w Admin (NIESPRAWDZONE treścią — do weryfikacji w KB)

| Obszar | Co sprawdzić | Sugerowany ton po przepisaniu |
|--------|----------------|-------------------------------|
| Personalizacja / projekt 3D | FAQ o wizualizacji, plikach CAD, „projekcie klienta” | Trzecia osoba + CTA: formularz „Zaprojektuj swój model”, bez „pokazałeś wcześniej” |
| Zaręczyny / rozmiar | FAQ mieszające politykę z doradztwem w 2. osobie | Fakty (pomiar, termin realizacji) + odesłanie do czatu/doradcy bez udawania historii |
| Zamówienia indywidualne | Wpisy w formie dialogu („prześlij mi…”) | Instrukcja krok po kroku w 3. osobie (Pan/Pani) |
| Wizyta w pracowni | Adres, godziny (regresja F2 — **zachować** fakty) | Już neutralne; tylko usunąć ewentualne „jak mówiłem” |

## Po przepisaniu w sklepie

1. Zimny smoke: S-E bez fantom 3D, F2 (Traugutta, telefony) bez regresji.
2. Potwierdzić w logach brak `kb.entry_rejected` dla poprawionych wpisów.
