# EPIR Blueprints and Exceptions

## Cel

Ten dokument zbiera reguły pomocnicze, które są ważne projektowo, ale nie powinny rozdmuchiwać dokumentów bazowych: wyjątki Project B, zasady agentowe, ograniczenia automatyzacji, limity API i wzorce analityczne.

## 1. Project A vs Project B

### Project A — produkcja buyer-facing

Obejmuje:

- Theme App Extension,
- storefronty headless,
- buyer-facing czat,
- pełne rygory ingressu i bezpieczeństwa.

Tu nie ma wyjątków od App Proxy / BFF / S2S ani od zasad sekretów.

### Project B — narzędzia wewnętrzne

Obejmuje:

- analitykę,
- BigQuery,
- dashboardy wewnętrzne,
- workflow developerskie i agentowe,
- serwerowe bypassy operacyjne potrzebne do ETL lub administracji.

Project B może używać uproszczonych ścieżek wewnętrznych, ale tylko poza ruchem buyer-facing i tylko po stronie serwera.

## 2. Agentic IDE i custom agents

Zasady:

- role agentów powinny być wąskie i jednoznaczne,
- agent wykonawczy nie jest recenzentem własnej pracy,
- recenzent architektury sprawdza zgodność z ESOG i kodem,
- recenzent spójności sprawdza mirror repo ↔ NotebookLM oraz usunięcie dubli,
- uprawnienia agentów mają respektować zasadę najmniejszych uprawnień.

Przykład dla tego repo:

- wykonawca dokumentacji,
- recenzent architektury,
- recenzent spójności.

## 3. Shopify data layer i modelowanie

- metaobjects preferujemy dla struktur złożonych,
- metafields zostają dla prostych punktów danych i referencji,
- nie projektujemy monolitycznych konfiguracji JSON tam, gdzie lepiej sprawdzą się referencje i struktury relacyjne,
- należy respektować aktualne ograniczenia platformy i nie traktować liczb z dokumentacji pomocniczej jako wiecznego kontraktu bez weryfikacji.

## 4. Automatyzacje i pipeline'y

### Shopify Flow

Shopify Flow pozostaje narzędziem event-driven, ale ma praktyczne limity, więc:

- dla większych wolumenów trzeba przewidywać external processing,
- dla złożonych integracji HTTP trzeba jawnie parsować i walidować odpowiedzi,
- nie wolno opierać krytycznego pipeline'u na założeniu, że Flow obsłuży dowolny rozmiar workloadu bez ograniczeń.

### ETL i BigQuery

Dla Project B obowiązują:

- idempotentność eksportu,
- sensowne mapowanie typów danych,
- partycjonowanie i klastrowanie w BigQuery,
- możliwość powiązania danych przez `session_id` / `_epir_session_id`, jeśli dany przepływ to wspiera.

## 5. Limity API i backoff

System musi zakładać, że Shopify będzie ograniczać ruch i koszt zapytań.

W praktyce:

- błędy `429` wymagają retry z backoffem,
- GraphQL cost nie może być ignorowany,
- duże batch'e i tablice muszą być dzielone na mniejsze porcje,
- nigdy nie wolno budować integracji tak, jakby limity nie istniały.

Dokładne liczby operacyjne trzeba zawsze weryfikować z aktualną dokumentacją Shopify i bieżącą konfiguracją planu.

## 6. Topologia wdrożeniowa EPIR

- `workers/chat` pozostaje głównym ingress i orchestrator-em rozmowy,
- `workers/rag-worker` dostarcza retrieval i budowę kontekstu,
- `workers/analytics` obsługuje ingest zdarzeń,
- `workers/bigquery-batch` eksportuje dane,
- Hydrogen storefronty pozostają odseparowanymi klientami backendu, a nie źródłem logiki AI.

## 7. Reguły dokumentacyjne

- blueprinty i wyjątki nie tworzą drugiej warstwy prawdy,
- jeśli zasada jest naprawdę kanoniczna, ma trafić do `EPIR_AI_ECOSYSTEM_MASTER.md` lub `EPIR_AI_BIBLE.md`,
- ten dokument ma służyć jako zwięzły zbiór wzorców pomocniczych, a nie magazyn wszystkiego.
