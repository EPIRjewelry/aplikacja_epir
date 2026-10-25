# Shopify Knowledge Base — kandydaci do przepisania (copy 2. osoby / założony kontekst)

**Status:** lista robocza dla operatora (Krzysztof). **Bez edycji live Admin** w tym PR.

Źródło: smoke S-E/S-F (fantom „projekt 3D … pokazałeś wcześniej”) — treść z FAQ sklepu, nie z repo.

## Kontrakt w kodzie (`buyer/kb-selection.ts`)

Wpisy odrzucane w runtime (`kb.entry_rejected`) przy markerach założonego kontekstu rozmowy.

## Kandydaci do audytu w Admin (NIESPRAWDZONE treścią)

| Obszar | Co sprawdzić |
|--------|----------------|
| Personalizacja / projekt 3D | FAQ w 2. osobie o plikach / wcześniejszej rozmowie |
| Zaręczyny | Mieszanie polityki z doradztwem rozmiar/termin w formie dialogu |
| Zamówienia indywidualne | Instrukcje „prześlij mi…” zamiast 3. osoby Pan/Pani |
| Wizyta w pracowni | Zachować fakty (adres, telefon); usunąć „jak mówiłem” jeśli jest |

## Gift card (NIESPRAWDZONE Observability)

Ścieżka karty podarunkowej przy „prezent” — potwierdzić w logach (`gemma.formulation` / `after_gift_card`) przed zmianą filtrów katalogu. **Ten PR nie zmienia filtrów.**
