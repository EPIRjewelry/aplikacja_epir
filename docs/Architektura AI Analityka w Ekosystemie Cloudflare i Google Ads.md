**Weryfikacja twierdzeń o R2 SQL**  
**1\. Limity R2 SQL istotne dla „AI analityka”**Zgodnie z dokumentem analitycznym 1:

* **JOIN (Dostępność tabel):** Dokładnie jedna tabela na zapytanie. *Cytat:* „Brak możliwości JOIN-ów; konieczność denormalizacji.”  
* **Subquery (Podzapytania):** *Cytat:* „Całkowity brak wsparcia (No subqueries) – Logika filtrowania musi być płaska.”  
* **Limit wierszy (Rozmiar wyniku):** Maksymalnie 10 000 wierszy. *Cytat:* „Ryzyko niekompletnych danych przy dużych zapytaniach.”  
* **OFFSET (Pagynacja):** Brak wsparcia dla OFFSET. *Cytat:* „Wymusza kursorowanie po kluczach unikalnych i WHERE.”  
* **Read-only (Tryb zapisu):** Wyłącznie Read-only. *Cytat:* „AI nie może bezpośrednio modyfikować jeziora danych.”

**2\. Sprzeczność w dokumentacji (JOIN)**Tak, w przekazanych materiałach występuje wyraźna sprzeczność.

* Dokument z analizą techniczną systemu twierdzi bezwzględnie: „zapytania mogą odnosić się tylko do jednej tabeli (brak JOIN i subquery)” 2 oraz „Całkowity brak wsparcia (No subqueries)” 1\.  
* Tymczasem oficjalna dokumentacja Cloudflare dotycząca R2 SQL wprost temu zaprzecza, podając w tabeli wspieranych funkcji: „**JOINs** (INNER, LEFT, RIGHT, FULL OUTER, CROSS) **Yes** All standard join types” oraz „**Subqueries** (IN, NOT IN) **Yes**” 3\.

**3\. Jak obejść brak JOIN w praktyce EPIR**Według dokumentu ograniczenie polegające na braku JOIN-ów należy zrekompensować poprzez „przeniesienie logiki relacyjnej do potoków Pipelines”, w których dane poddawane są denormalizacji (są „zszywane”) już na etapie ich zapisu do usługi R2 4, 5\. Innym wskazanym sposobem obejścia tego limitu jest narzucenie agentowi AI wykonywania sekwencyjnych zapytań i łączenia zebranych wyników bezpośrednio we własnej pamięci operacyjnej (Context Window) 4\.  
**Architektura agenta**  
**4\. Dwa mechanizmy orkiestracji (Workflows vs Agents SDK)**Dokument wskazuje dwa mechanizmy:

* **Cloudflare Workflows:** Rekomendowane do procesów długotrwałych (trwałych, wieloetapowych zadań), które wymagają zachowania stanu pomiędzy krokami, automatycznego ponawiania (retry) w razie błędów lub oczekiwania (np. na manualną akceptację użytkownika w zadaniach z rygorem *human-in-the-loop*) 6-8.  
* **Agents SDK:** Zalecane do bieżących interakcji w interfejsie użytkownika (np. w Cursor/IDE) oraz prowadzenia interaktywnych sesji analitycznych, ponieważ Durable Objects ułatwiają płynną i stanową komunikację przez WebSockety z zachowaniem historii rozmowy 5, 6, 9\.

**5\. AI Gateway jako obowiązkowy**Tak, dokument wyraźnie zaleca AI Gateway jako „obowiązkowy punkt kontrolny dla każdego wywołania modelu LLM” 5\. Trzy powody podane w tekście to 10:

1. **Caching:** Ponawiane zapytania o te same dane (np. ROAS) mogą wracać z pamięci podręcznej, co oszczędza czas i tokeny.  
2. **Rate Limiting:** Zapewnia ochronę przed nadużyciami i niekontrolowanym wzrostem kosztów API.  
3. **Observability:** Umożliwia pełne logowanie zapytań i odpowiedzi niezbędne do audytu działań agenta AI.

**6\. Sandbox SDK vs Dynamic Workers**Wykorzystanie **Sandbox SDK** oznacza uruchomienie kodu (np. wygenerowanego przez AI do obsługi biblioteki Pandas w Pythonie) w pełnych, izolowanych kontenerach Linux, co jest najbezpieczniejszym modelem dla przetwarzania danych wewnątrz zaufanej infrastruktury 11, 12\. Natomiast opcja „zwykłego” **Dynamic Worker** dotyczy izolowanych instancji Workers wykonujących szybki kod w JS/TS bez podnoszenia ciężkiego, pełnego kontenera 11\.  
**Google Ads i ryzyko**  
**7\. Uzasadnienie OAuth i warstwy kontroli**Dokument uzasadnia to tym, że standardowy zakres Google Ads API (https://www.googleapis.com/auth/adwords) wymusza współdzielenie uprawnień – ten sam klucz do „odczytu raportów” daje z automatu prawo do bardzo groźnych działań, np. usuwania kampanii lub modyfikacji budżetów, a Google na poziomie tokenu tego nie separuje 13, 14\. Zamiast tego dokument proponuje separację w **warstwie aplikacji** poprzez użycie ograniczonego serwera MCP od Google (tylko do odczytu) lub wymuszenie dodatkowej **warstwy kontroli przez potwierdzenia w Workflows** (Double Confirmation / *human-in-the-loop*) 5, 13, 15\.  
**8\. Trzy fazy ewolucji analityka AI**Zgodnie z dokumentem rozwój powinien składać się z trzech faz 12, 16:

* **Faza 1: Analityka i Drill-down (Read-only)** – Agent służy wyłącznie do bezpiecznej interpretacji, raportowania i wizualizacji danych w IDE (przy pomocy zablokowanego serwera tylko do odczytu).  
* **Faza 2: Rekomendacje i Symulacje (Dry-run)** – Agent AI jest upoważniony do proponowania mutacji, ale wysyła je do API Google wyłącznie w weryfikacyjnym trybie dry\_run=true, co chroni konto produkcyjne.  
* **Faza 3: Pełna Automatyzacja (Human-in-the-loop)** – Integracja narzędzia z Workflows, by wygenerowany przez agenta plan fizycznych zmian na koncie trafiał do kolejki wymagającej potwierdzenia przez menedżera.

**9\. Oficjalny serwer googleads/google-ads-mcp**Oficjalny serwer MCP udostępniany przez Google jest zablokowany wyłącznie w bezpiecznym trybie „tylko do odczytu (Read-only)” 17\. Oferuje on podstawowe możliwości badawcze: pobieranie listy dostępnych klientów (list\_accessible\_customers), wykonywanie kwerend raportowych (search / GAQL) oraz sprawdzanie struktury tabel (get\_resource\_metadata) 15, 18\.  
**Repozytoria i „nie znaleziono”**  
**10\. Wymienione repozytoria i ich funkcja** 19:

1. **github.com/cloudflare/agents** – Oficjalny framework do budowy stanowych agentów na Durable Objects.  
2. **github.com/cloudflare/agents-starter** – Najlepszy punkt wyjścia dla implementacji narzędzi (tools) i integracji z Workers AI.  
3. **github.com/googleads/google-ads-mcp** – Oficjalny serwer MCP od Google, standard dla bezpiecznego odczytu danych z reklam.  
4. **github.com/itallstartedwithaidea/google-ads-mcp** – Rozszerzona wersja serwera MCP z obsługą większej liczby narzędzi i integracją z Cloudflare.  
5. **github.com/FGRibreau/mcp-google-ads** – Referencyjna implementacja bezpieczeństwa z mechanizmem „double confirmation” i trybem tylko do odczytu.  
6. **github.com/maxghenis/google-ads-mcp** – Alternatywny serwer MCP wspierający operacje zapisu i zaawansowane zapytania GAQL.  
7. **github.com/cloudflare/cloudflare-docs** – Katalog src/content/docs/r2-sql zawierający techniczne tutoriale end-to-end dla potoków danych.  
8. **github.com/cloudflare/workers-sdk** – Repozytorium zawierające definicje i przykłady użycia bindingów dla R2 SQL oraz systemy zarządzania sekretami.

**11\. Czego nie znaleziono i skutki**Dokument świadomie nie znalazł oficjalnego i „gotowego do wdrożenia szablonu EPIR AI Analyst” 20\. Wynika z tego bezpośrednio, że zespół projektowy musi samodzielnie zaprojektować układ i przeprowadzić manualną integrację opisanych w tekście niezależnych od siebie komponentów infrastrukturalnych 20\.  
**Jakość źródeł**  
**12\. Najmniej oficjalne linki z bibliografii**Z zestawienia źródeł zewnętrznych 20 są to:

1. **almcorp.com** (https://almcorp.com/blog/google-ads-api-multi-factor-authentication/) – Blog komercyjnej agencji.  
2. **obsidiansecurity.com** (https://www.obsidiansecurity.com/blog/oauth-scopes-permissions-security-best-practices) – Wpis blogowy na stronie prywatnej firmy z branży bezpieczeństwa SaaS.  
3. **lib.rs** / **lobehub.com** (np. https://lib.rs/crates/mcp-google-ads) – Niezależne, społecznościowe agregatory i katalogi kodów open-source.

**Dlaczego wymagają osobnej weryfikacji:** Nie są to oficjalne dokumentacje Google (z developers.google.com) ani Cloudflare. Mogą opierać się na subiektywnych radach, przestarzałych opisach API lub zawierać społecznościowy kod open-source nienależący do oficjalnej gałęzi dostawców chmurowych.  
**Dopasowanie do EPIR**  
**13\. Odwzorowanie modułów w istniejącym systemieBrak w źródle** jakichkolwiek wzmianek o dedykowanych serwisach takich jak epir-analityc-worker, epir-bigquery-batch czy marketing-ingest – z przekazanego tekstu nie da się powiązać rekomendacji Cloudflare bezpośrednio z tymi nazwami. Dokument opisuje architekturę EPIR wyłącznie za pomocą ogólnych, wbudowanych mechanizmów CF: dane płyną przez potoki (Cloudflare Pipelines), walidacja odbywa się w warstwie „HTTP Ingest”, by ostatecznie trafić jako denormalizowane pliki Parquet do katalogu Iceberg w systemie R2 Storage celem uniknięcia ograniczeń na R2 SQL 21, 22\.  
**14\. Najważniejsze ryzyko dla budującego w Cursorze z Workerem w tle**Najpoważniejszym ryzykiem jest podatność na ataki typu **„prompt injection”**, które mogą prowadzić do złośliwej eskalacji uprawnień w infrastrukturze 12\. Z uwagi na to, że agent zintegrowany z IDE będzie dynamicznie generował i próbował wykonać kod analityczny wprost na danych, do jego uruchomienia konieczne jest bezpieczne odizolowanie w Sandbox SDK 11, 12\.  
