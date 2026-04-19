# E2E asystent-klienta (Playwright)

Szkielet testów E2E Playwright, wyzwalany przez `npm test` z `extensions/asystent-klienta`.

## Uruchomienie

```powershell
Set-Location d:\aplikacja_epir\extensions\asystent-klienta
npm install
npx playwright install chromium
npm test
```

## Konfiguracja przez zmienne środowiskowe

| Zmienna | Opis |
|---------|------|
| `EPIR_TEST_BASE_URL` | Adres sklepu (domyślnie `https://epirbizuteria.pl`). Ustaw na dev store przy dymnym teście. |
| `EPIR_TEST_SHOP_PASSWORD` | Hasło bramki sklepu, jeśli włączona. |
| `EPIR_TEST_CUSTOMER_EMAIL` | Email klienta testowego — włącza scenariusz zalogowany. |
| `EPIR_TEST_CUSTOMER_PASS` | Hasło klienta testowego. |

Bez poświadczeń scenariusz zalogowany jest pomijany (`test.skip`) — pozostałe dwa pokrywają anonimowy flow widgetu.

## Zakres asercji

Testy celowo **nie sprawdzają dokładnej treści** odpowiedzi (LLM jest niedeterministyczny) — weryfikują:

1. że `POST /apps/assistant/chat` zwraca 200,
2. że w oknie rozmowy pojawia się nietrywialna odpowiedź asystenta (>10 znaków).

Regresje tekstowe wykrywa Vitest w `workers/chat`.