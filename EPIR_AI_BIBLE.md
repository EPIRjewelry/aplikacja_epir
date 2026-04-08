# EPIR AI BIBLE

## Rola tego dokumentu

To jest dokument reguł nienegocjowalnych. Odpowiada na pytanie **czego nie wolno łamać** przy projektowaniu, review, implementacji, deployu i utrzymaniu dokumentacji.

Jeżeli propozycja kodu lub dokumentacji jest sprzeczna z tym plikiem, propozycja jest błędna.

## Zasady podstawowe

1. **Jedna aplikacja Shopify:** `epir_ai`
2. **Jedna gałąź kanoniczna:** `main`
3. **Jedno repo źródłowe:** `d:\aplikacja_epir`
4. **Jedna dokumentacja kanoniczna:** tylko zestaw wskazany w `docs/README.md`
5. **Jeden mirror NotebookLM:** identyczna kopia 1:1 dokumentów z repo, bez dodatkowych plików

## Guardrails architektury

### 1. Frontend vs backend

MUST:

- frontend pozostaje warstwą UI i klienta API,
- AI, integracje, sekrety, stan i logika workflow pozostają w backendzie / workerach.

MUST NOT:

- wkładać Admin API do klienta,
- wkładać sekretów do przeglądarki,
- przenosić logiki AI do bundle frontendu.

### 2. Ingress i zaufanie do ruchu

MUST:

- dla Online Store używać Shopify App Proxy,
- dla headless używać BFF `/api/chat` i serwerowego S2S `/chat`,
- traktować ingress jako osobne źródło prawdy o tożsamości żądania.

MUST NOT:

- wołać `https://asystent.epirbizuteria.pl/chat` bezpośrednio z przeglądarki,
- omijać HMAC App Proxy,
- wstrzykiwać `X-EPIR-*` do kodu klienta.

### 3. Sekrety i klucze

MUST:

- trzymać sekrety wyłącznie w backendzie i secret storage,
- traktować `SHOPIFY_APP_SECRET`, `EPIR_CHAT_SHARED_SECRET`, klucze GCP, klucze AI i tokeny prywatne jako backend-only.

MUST NOT:

- commitować realnych sekretów do repo,
- powielać ich w dokumentacji jako wartości,
- prosić użytkowników o wklejanie sekretów do czatu.

### 4. `storefrontId` i `channel`

MUST:

- utrzymywać `storefrontId` i `channel` jako podstawowy kontekst routingu,
- dobierać na ich podstawie profil wiedzy, rolę i zachowanie agenta.

MUST NOT:

- traktować tych pól jako opcjonalnej kosmetyki,
- mieszać buyer-facing i internal kontekstu bez świadomego przełączenia.

### 5. Project A vs Project B

#### Project A

Ruch produkcyjny kupującego:

- Theme App Extension,
- storefronty headless,
- buyer-facing chat,
- polityki ingressu i bezpieczeństwa w pełnej mocy.

#### Project B

Narzędzia wewnętrzne i analityczne:

- BigQuery,
- workflow developerskie,
- wewnętrzne dashboardy,
- serwerowe bypassy operacyjne, ale wyłącznie poza frontendem buyer-facing.

MUST NOT:

- rozszerzać wyjątków Project B na Project A,
- usprawiedliwiać obejść frontowych potrzebami analityki lub debugowania.

### 6. Dane i pamięć

MUST:

- traktować Shopify jako źródło prawdy dla danych commerce,
- trzymać stan rozmów po stronie Cloudflare,
- wyraźnie rozdzielać historię sesji od historii zamówień.

MUST NOT:

- obiecywać buyer-facing użytkownikowi dostępu do danych, których system realnie nie dostarcza,
- zgadywać polityk sklepu zamiast pobierać je z kanonicznego źródła.

### 7. Dokumentacja

MUST:

- utrzymywać tylko aktualny pakiet dokumentów,
- aktualizować instrukcje AI i onboarding przy zmianie nazw lub struktury,
- usuwać stare helpery, quizy, checkpointy i duplikaty, gdy ich treść została przejęta przez pakiet kanoniczny.

MUST NOT:

- utrzymywać drugiego zestawu dokumentów dla NotebookLM,
- oznaczać starych plików jako „historyczne” zamiast je usuwać,
- zostawiać równoległych opisów tej samej reguły.

### 8. Review i implementacja

MUST:

- recenzować zmiany architektoniczne względem `EPIR_AI_ECOSYSTEM_MASTER.md`, tego dokumentu i aktualnego kodu,
- traktować testy ingressu, bezpieczeństwa i routing context jako bramkę jakości,
- utrzymywać zasadę: brak zgodności z guardrails = brak wdrożenia.

MUST NOT:

- przepychać zmian „bo działa lokalnie”, jeśli łamią orthodoksję,
- osłabiać testów P0 tylko po to, żeby przejść pipeline.

## Jak używać tej Biblii

- `EPIR_AI_ECOSYSTEM_MASTER.md` mówi **jak system działa**.
- `EPIR_AI_BIBLE.md` mówi **jakich granic nie przekraczać**.
- dokumenty w `docs/` doprecyzowują runtime, dane, operacje i wyjątki, ale nie mogą nadpisywać tej Biblii.
