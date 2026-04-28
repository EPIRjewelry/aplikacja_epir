---
name: Banner zgód — treść i UX
overview: Zaktualizować copy zgody (czat + cookie/analityka), ukryć główny panel po udzieleniu zgody oraz zapewnić możliwość cofnięcia zgody bez blokowania czatu.
todos:
  - id: copy-both-apps
    content: Podmienić treść label ConsentToggle (+ opcjonalnie link do polityki) w apps/zareczyny/app/root.tsx i apps/kazka/app/root.tsx
  - id: hide-panel-after-consent
    content: Renderować główny fixed panel z checkboxem tylko gdy brak zgody (lub błąd/pending); po zgodzie — ukryć duży kartusz
  - id: revoke-control
    content: Dodać dyskretny sposób cofnięcia zgody (np. jednolinijkowy „Cofnij zgodę” w tym samym rogu), aby nie utracić możliwości withdraw z UI
  - id: granular-note
    content: W opisie PR — przyszłe rozdzielenie zgód = osobne toggles + mapowanie setTrackingConsent; nie w tej iteracji
---

# Banner zgód: treść (czat + cookie) i znikający panel

## Zaakceptowany zakres (z poprzedniej rozmowy)

- Tekst ma **jasno** obejmować **czat oraz pliki cookie / analitykę / dopasowanie treści** (zgodnie z faktycznym `CustomerPrivacyConsentBridge` + `/api/consent`), w **możliwie prostej** formie — wariant skondensowany lub dwulinijkowy; osobna redakcja dla **Zareczyny** vs **Kazka**.
- Opcjonalnie: link **„Polityka prywatności”** zbudowany z `PUBLIC_STORE_DOMAIN` + zweryfikowany handle polityki w Shopify Admin — link **poza** `<label>` checkboxa (żeby klik nie przełączał zgody), np. osobny wiersz pod tekstem.

## Nowy wymóg UX (od Ciebie)

**Problem:** Panel (fixed, lewy dół) z checkboxem **pozostaje widoczny po udzieleniu zgody** — przeszkadza w pracy z czatem / stroną.

**Oczekiwanie:** Po **udzieleniu zgody** główny „kartusz” z długim tekstem ma **znikać**, zamiast być stale na ekranie.

### Zachowanie techniczne (do wdrożenia)

1. **Warunkowe renderowanie** obecnego `div.fixed.bottom-4.left-4...` z `ConsentToggle` + `consentError`:
   - Pokazuj, gdy użytkownik **nie** wyraził jeszcze zgody (`!consentGranted`), **albo** trwa `pendingConsent`, **albo** jest `consentError` (żeby błąd zapisu był widoczny).
   - Po **`consentGranted === true`** i braku błędu — **nie** renderuj tego dużego panelu.

2. **Cofnięcie zgody (withdraw)** — wymóg praktyczny i compliance: jeśli całkowicie usuniemy jakikolwiek dostęp do odznaczenia zgody, użytkownik nie cofnie zgody bez czyszczenia storage / innej ścieżki.
   - **Rekomendacja:** po ukryciu głównego panelu zostawić w tym samym rogu (lub tuż przy launcherze czatu) **jedną dyskretną linię**: np. tekst lub przycisk **„Cofnij zgodę”** wywołujący istniejącą ścieżkę `onConsentChange(false)` (ta sama logika co odznaczenie checkboxa: `storeConsent(false, ...)`, aktualizacja stanu, `CustomerPrivacyConsentBridge` zsynchronizuje Customer Privacy).
   - Alternatywa (większy zakres): link w stopce / strona polityki — gorsza widoczność; nie blokuje merge, ale withdraw powinien być **realny z UI**.

3. **`ChatWidget`** pozostaje jak jest przekazywany `consentGranted` — po zgodzie czat działa; panel z głównym tekstem nie zasłania interfejsu.

## Pliki do edycji

- [`apps/zareczyny/app/root.tsx`](apps/zareczyny/app/root.tsx) — `ZareczynyConsentAndChat`: treść label, warunek widoczności panelu, kontrolka „Cofnij zgodę”.
- [`apps/kazka/app/root.tsx`](apps/kazka/app/root.tsx) — `KazkaConsentAndChat`: to samo.

Bez zmian w [`ConsentToggle`](packages/ui/src/ConsentToggle.tsx), chyba że okaże się potrzebny drobny props (preferuj rozwiązanie w `root.tsx`).

## Rozdzielenie zgód na później (bez zmian w tej iteracji)

- **UI:** osobne przełączniki lub banner Shopify z preferencjami — po decyzji produktowej; unikać dwóch pełnych równoległych bannerów bez harmonogramu.
- **Kod:** mapowanie pól `analytics` / `marketing` / … w [`CustomerPrivacyConsentBridge`](packages/ui/src/CustomerPrivacyConsentBridge.tsx) zamiast jednego booleana — osobny ticket.
- **Prawo / treść:** dopasować copy do faktycznej granularności, gdy pojawią się osobne zgody.

## Test ręczny po wdrożeniu

- Pierwsza wizyta (czyste storage): widoczny panel zgody → zgoda → **panel znika** / zostaje tylko „Cofnij zgodę” (według wybranej wariantacji).
- Cofnięcie: stan wraca, czat zablokowany zgodnie z obecną logiką.
- Ponowna zgoda: działa jak dotąd.
