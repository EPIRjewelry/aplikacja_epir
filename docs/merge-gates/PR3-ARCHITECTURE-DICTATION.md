# PR3 — szablon dyktandy architektury (release gates)

**Cel:** uzupełnić politykę w sposób jednoznaczny dla ludzi i CI. To nie jest pełna specyfikacja — tylko **numerowane prompty** do wypełnienia. Po wypełnieniu treść powinna trafić do kanonicznych dokumentów (`docs/README.md`) i ewentualnie do skryptów/workflowów.

**Powiązania:**

- Karta zakresu dokumentacji PR3: [`PR3.md`](PR3.md) — *status integracji release gates: w toku / oczekuje na dyktandę (poniżej)*.
- Stan techniczny dziś: workflow **Deploy safety policy** (`deploy-policy.yml`) + `scripts/ci/validate-wrangler-prod-policy.py` (m.in. `workers_dev`, vars); workflow **PR3 release gates** (`pr3-release-gates.yml`) — skan sekretów (Gitleaks).

---

## 1. Taksonomia sekretów

1. Wypisz **kategorie sekretów** używane w EPIR (np. Shopify, Cloudflare, dostawcy LLM, BQ, tokeny CI). Dla każdej: *gdzie żyje* (GitHub Secrets, Wrangler secret, D1, itd.).
2. Zdefiniuj, co uznajemy za **„jawny w repo”** vs **„dozwolony placeholder”** (np. publiczne ID vs klucze prywatne).
3. Czy **testowe** klucze (`sk-test-…`) mogą być kiedykolwiek w repozytorium? Jeśli tak — pod jakim warunkiem i w jakich ścieżkach?

## 2. Dozwolone wzorce (allowlist)

1. Wypisz **wzorce / prefiksy / pliki**, które CI **musi ignorować** (np. dokumentacja z przykładowymi stringami, fixture, snapshoty). Uzasadnij każdy wpis.
2. Czy istnieją **regex lub ścieżki** wyłączone wyłącznie tymczasowo? Jeśli tak — data wygaśnięcia i właściciel.

## 3. Kryteria FAIL (blokada merge)

1. Kiedy **`pr3-secret-scan` (Gitleaks)** ma **FAIL**? (np. każdy trafiony sekret = blokada, vs tylko „wysoka pewność”).
2. Czy skan **artefaktów buildu** (np. `dist/`, `build/`, wrzucane artefakty CI) ma być wymagany przed merge? Jeśli tak — które katalogi i w którym jobie.
3. Czy **wynik skanu zależy od gałęzi** (np. inne reguły na `main` vs feature)?

## 4. Reguły domeny deweloperskiej

1. Czy **`*.workers.dev`** jest **dozwolone** w jakimkolwiek środowisku? Jeśli tak — które worker-y / env w Wrangler i pod jaką nazwą.
2. Domyślne **`workers_dev`** w root i w `[env.production]`: **true/false** per polityka (obecny walidator wymusza brak publicznego dev endpointu na profilu prod — potwierdź lub zmień założenia).
3. Inne **publiczne URL** zabronione w prod (np. preview Pages, strefy DNS): wypisz.

## 5. Staging vs production

1. Jak rozróżniamy **staging** i **production** w Wrangler (`[env.staging]` vs `[env.production]` lub osobne pliki)? Krótka tabela: *środowisko → plik / env → dozwolone domeny*.
2. Czy **deploy ręczny** (`workflow_dispatch`) może ominąć którykolwiek gate? (Powinno być: nie, lub wyjątki opisane tu.)

## 6. Macierz vars / secrets (Wrangler)

1. Dla każdego workera z `workers/*/wrangler.toml`: które wartości są **vars** (nie-sekret), które **secrets**, które **tylko dashboard**.
2. Czy obecne **wykrywanie „wygląda jak sekret”** w `[vars]` (skrypt Python) jest kompletne? Czego brakuje (np. dodatkowe regex, webhook URL)?

## 7. Overridy i akceptacja wyjątków

1. Kto **zatwierdza** tymczasowe wyłączenie bramki lub merge z known-false-positive?
2. Gdzie **zapisujemy** decyzję (issue, ADR, komentarz PR, wpis w `merge-gates`)?
3. Maksymalny **czas życia** wyjątku (SLA).

---

*Po wypełnieniu: zaktualizuj status w [`PR3.md`](PR3.md) i zsynchronizuj z `EPIR_DEPLOYMENT_AND_OPERATIONS.md` (bramka go/no-go).*
