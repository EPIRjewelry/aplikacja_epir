# AGENTS.md

## Cel tego pliku

Ten plik jest **wspólnym, repozytoryjnym onboardingiem dla narzędzi AI** pracujących w `d:\aplikacja_epir`.

Jeżeli otwierasz to repo w nowym środowisku (nowy komputer, nowy VS Code, Cursor, inny agent), zacznij od tego pliku oraz dwóch dokumentów bazowych wskazanych poniżej.

## Czytaj najpierw

Obowiązkowa kolejność:

1. `EPIR_AI_ECOSYSTEM_MASTER.md`
2. `EPIR_AI_BIBLE.md`
3. `docs/README.md`

## Niezmienne fakty o repo

- **Jedna aplikacja Shopify:** `epir_ai`
- **Jedna gałąź robocza jako źródło prawdy:** `main`
- **Jedno repo:** `EPIRjewelry/aplikacja_epir`
- **Jedno miejsce pracy:** to repozytorium, bez równoległego „drugiego backendu”

Jeżeli dokumentacja, notatka lub propozycja zmian sugeruje alternatywną architekturę poza tym repo, traktuj to jako podejrzane i weryfikuj względem dokumentów bazowych.

## Dwa dokumenty nadrzędne

### `EPIR_AI_ECOSYSTEM_MASTER.md`

Ten dokument odpowiada na pytanie:

- **jak system jest zbudowany**,
- **jak działają kanały i storefronty**,
- **jak rozdzielone są role agentów**,
- **jakie prompty systemowe obowiązują na produkcji**.

### `EPIR_AI_BIBLE.md`

Ten dokument odpowiada na pytanie:

- **jakich zasad nie wolno łamać**,
- **jak wygląda orthodoksja ESOG**,
- **jakie są guardrails bezpieczeństwa i architektury**.

Jeżeli jest konflikt interpretacyjny:

- najpierw czytaj `EPIR_AI_ECOSYSTEM_MASTER.md` dla modelu systemu,
- następnie `EPIR_AI_BIBLE.md` dla zasad wykonania i oceny zgodności.

## Model systemu w skrócie

- EPIR AI to aplikacja Shopify obsługująca:
  - klasyczny sklep (`Theme App Extension`),
  - headless `kazka`,
  - headless `zareczyny`.
- Jedynym dozwolonym ingress z frontendu do backendu AI jest:
  - Shopify App Proxy pod `/apps/assistant/`
- Chat backend działa jako:
  - Cloudflare `Chat Worker / MCP`
- Warstwa wiedzy i analityki obejmuje:
  - `RAG Worker`,
  - `analytics` worker,
  - `bigquery-batch`,
  - `D1`, `Durable Objects`, `BigQuery`.

## Kluczowe reguły architektoniczne

### Frontend vs backend

- Frontend (`Theme`, `Hydrogen`) to tylko UI + klient API.
- Logika AI, integracje i sekrety pozostają w backendzie / workerach.
- Nie wolno wkładać Admin API ani sekretów do klienta.

### Ingress i sklep Shopify

- Dla sklepu `epir-art-silver-jewellery.myshopify.com` dostęp operacyjny ma iść przez istniejący MCP / App Proxy model.
- Nie projektuj równoległych backendów ani bezpośrednich obejść dla tego sklepu, jeśli istnieje już kanoniczna ścieżka przez MCP/App Proxy.

### Kontekst żądań

Każde żądanie czatowe powinno być rozumiane przez pryzmat:

- `storefrontId`
- `channel`

Typowe kanały:

- `online-store`
- `hydrogen-kazka`
- `hydrogen-zareczyny`
- `internal-dashboard`

### Role AI

- Buyer-facing: `Gemma`
- Internal/developer-facing: `Dev-asystent`

Nie wolno mieszać tych kontekstów.

## Dokumenty pomocnicze

Po dokumentach bazowych czytaj dopiero dokumenty pomocnicze, np.:

- `KROKI_URUCHOMIENIA.md`
- `docs/DEPLOYMENT_EPIR.md`
- `docs/SEKRETY_I_MIGRACJE.md`
- `docs/ANALYTICS_KB.md`

Te dokumenty są wtórne wobec:

- `EPIR_AI_ECOSYSTEM_MASTER.md`
- `EPIR_AI_BIBLE.md`

## Zasady pracy dla agentów

### Przed zmianą kodu

1. Ustal, czy problem dotyczy architektury, dokumentacji, deployu, analytics czy promptów.
2. Przeczytaj odpowiednie dokumenty bazowe.
3. Zweryfikuj, czy nie istnieje już repozytoryjna instrukcja, skill lub prompt dla danego obszaru.

### Przy recenzji i implementacji

- ESOG recenzuje zgodność, nie implementuje.
- Fix agent implementuje, ale bez zmiany architektury wysokiego poziomu bez wyraźnej decyzji.
- Dokumenty pomocnicze nie nadpisują dokumentów bazowych.

### Przy pracy na branchach

- `main` jest kanoniczną gałęzią źródła prawdy.
- Nie zakładaj istnienia równoległego „stanu prawdziwszego niż main”.
- Jeżeli coś lokalnego nie jest w repo, to inny komputer tego nie odziedziczy.

## Co musi być w repo, aby nowy komputer widział to samo

Aby nowe środowisko po klonie miało ten sam kontekst:

- instrukcje muszą być zapisane w repo,
- dokumenty bazowe muszą być w repo,
- instrukcje dla Copilota/Cursora muszą wskazywać na te dokumenty,
- nie polegaj na lokalnym stashu, lokalnych promptach użytkownika ani pamięci pojedynczej sesji.

## Jeśli nie wiesz, od czego zacząć

Użyj tej sekwencji:

1. `AGENTS.md`
2. `EPIR_AI_ECOSYSTEM_MASTER.md`
3. `EPIR_AI_BIBLE.md`
4. `docs/README.md`

Dopiero potem przechodź do kodu, workerów i dokumentów operacyjnych.
