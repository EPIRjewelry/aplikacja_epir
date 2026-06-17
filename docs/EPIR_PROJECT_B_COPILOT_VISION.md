# Project B — wizja „copilota” analityczno-doradczego (materiał roboczy)

**Status:** kompas produktowy / architektoniczny — **niewiążący** do czasu wchłonięcia do `EPIR_AI_ECOSYSTEM_MASTER.md`, `EPIR_BLUEPRINTS_AND_EXCEPTIONS.md` lub kodu. Zgodny z podziałem **Project A (buyer-facing)** vs **Project B (wewnętrzny)** z `EPIR_AI_ECOSYSTEM_MASTER.md`.

## 1. Kim jest agent w tej filozofii

- **Jeden główny użytkownik (Ty)** + kontekst **firmy EPIR** (marki, storefronty, polityka kampanii).
- **Rola:** doradca analityczny i operacyjny — łączy sygnały z **(1) Web Pixela**, **(2) GA4**, **(3) Google Ads** (Meta w perspektywie), pilnuje **standardów agenta doradczego**: ugruntowanie w danych, jawność źródeł, brak zmyślania metryk, propozycja następnego kroku.
- **Ciągłość pracy:** „pamięć” ma sens warstwowo (patrz §4), nie jako jeden magiczny blob w prompcie.

## 2. Skąd agent bierze „wszystkie dane” (rzeczywista mapa repo)

| Źródło | Gdzie żyje dane | Jak copilot może je dziś / wkrótce konsumować |
|--------|------------------|-----------------------------------------------|
| **Web Pixel** | `workers/analytics` → D1 → `workers/bigquery-batch` → hurtownia / widoki zgodne z `EPIR_DATA_SCHEMA_CONTRACT` | W czacie kanału `operator` (rola `analyst`): narzędzie **`run_analytics_query`** (whitelist **`queryId` Q1–Q10**) — **główna kopalnia** zdarzeń / zachowań w pipeline EPIR (nie mylić z sesjami Shopify Admin). |
| **GA4 + Google Ads** | `workers/marketing-ingest` (ingest + `GET /ops/marketing-preview`) | W czacie `operator` (rola `analyst`): narzędzie **`fetch_marketing_preview`** (serwerowy `GET` + Bearer); wymaga `MARKETING_INGEST_ORIGIN` + `MARKETING_OPS_PREVIEW_KEY` na workerze czatu (ta sama wartość Bearer co na ingest). |
| **Natywna analityka Shopify** | Shopify Admin GraphQL `shopifyqlQuery` (ShopifyQL) | W czacie `operator`: narzędzie **`run_shopify_shopifyql`** — wyłącznie **presety** z whitelisty (`S1`…`S3`); wymaga scope **`read_reports`** na aplikacji i `SHOPIFY_ADMIN_TOKEN`. |
| **Meta Ads** | (przyszłość) | Ten sam wzorzec co Ads: osobny ingest lub API, **sekrety tylko w Workerach**; agent nigdy nie „widzi” refresh tokena w przeglądarce. |

**Zasada orthodoksji:** Project B może mieć **szerszy** dostęp serwerowy niż UI sklepu, ale **nadal** jeden kanon kontraktów (`EPIR_DATA_SCHEMA_CONTRACT`, whitelist zapytań) — bez równoległej „tajnej prawdy” w drugim repo dokumentacji.

## 3. Standard „agenta doradcy” (zachowanie, nie tylko prompt)

- **Ugruntowanie:** każda liczba ma źródło (`source` w JSON narzędzia: `epir_warehouse`, `marketing_preview`, `shopify_shopifyql`) albo jest oznaczona jako **hipoteza** z brakującym dowodem.
- **Proaktywność:** proponuje **kolejność** zapytań (np. Q8 → Q6 → Q1), nie „lanie wody”.
- **Transparentność limitów:** mówi wprost, gdy brakuje narzędzia (np. świeży GA4 bez wywołania `marketing-ingest`).
- **Firma i kontekst:** krótka, **utrwalana** nota operatora / firmy (roadmap §4) — unika powtarzania „kim jest EPIR” w każdej turze (oszczędność tokenów).

## 4. Pamięć i „mnie zna” — warstwy (kreatywnie, ale uczciwie)

| Warstwa | Cel | Realizacja (kierunek) |
|---------|-----|------------------------|
| **Sesja** | Nitka bieżącej rozmowy | Już: `SessionDO` + `session_id` (solo UI w `sessionStorage`). |
| **Epizodyczne streszczenia** | Długa historia bez palenia tokenów | Worker: co N tur zapisuje **kompaktowy digest** do D1 / DO (np. „ustalone: X, otwarte: Y”) i wkleja go jako jeden blok systemowy. |
| **Profil operatora / firmy** | „Zna mnie i firmę” | D1 (lub KV): rekord `internal_operator_profile` — stałe pola (role, priorytety kampanii, nazwy marek, zakazane tematy). Edycja tylko przez zaufany endpoint lub Ty ręcznie na start. |
| **Pamięć semantyczna** (opcjonalnie) | „Przypomnij mi zeszłym razem…” | Ostrożnie: **Vectorize** / embeddingi tylko dla **Twoich** notatek operacyjnych, nie dla danych osobowych kupujących bez osobnej podstawy prawnej — spójnie z ideą `EPIR_MEMORY_ARCHITECTURE.md`, ale z **osobnym** zasobem dla Project B. |

## 5. Koszt tokenów — „wszystkie możliwości obniżenia” (realistyczny zestaw)

1. **Router warstwowy:** mały / tani model (lub reguły) klasyfikuje intencję → tylko wtedy pełny model do syntezy.  
2. **Narzędzia przed LLM:** maksymalnie dane z `run_analytics_query` / `fetch_marketing_preview` / `run_shopify_shopifyql` **w JSON**, model robi **interpretację**, nie odgadywanie liczb.  
3. **Digest sesji** (§4): skracanie historii chatu.  
4. **Workers AI:** gdzie sensowne, `x-session-affinity` / prefix cache (patrz istniejące wzorce w workerze czatu).  
5. **AI Gateway (Groq):** jedna ścieżka, brak duplikacji wywołań; unikanie podwójnego opisu schematów w prompcie.  
6. **Raporty wsadowe (tło):** zamiast 50 tur chatu — **jeden** run Cron + jedna wiadomość e-mail / plik / wpis w D1 z linkiem „otwórz w czacie”.

## 6. Praca w tle i raporty

- **Wzorzec:** już macie ideę **stanowego analityka** (np. marketing DO + refresh) — analogicznie **„nocny skan”**: Cron Trigger → odczyt whitelisty zapytań + ewentualnie snapshot marketingu → zapis **raportu** (Markdown w R2 / wiersz w D1 / e-mail przez zaufany connector).  
- **Okno czatu** pokazuje ostatni raport jako **jedną** wiadomość systemową lub link — znowu: tokeny idą w interpretację, nie w przerzucanie surowych tabel.

## 7. Google Workspace (marzenie — ścieżki bez łamania orthodoksji)

| Opcja | Idea | Uwagi |
|-------|------|--------|
| **Gmail / Google Chat** (nadawca = Ty / service account) | Raport dzienny / alert | OAuth po stronie Workera, minimalne scope’y, log audytu. |
| **Google Drive** | Zapis `Raport_EPIR_YYYY-MM-DD.md` | Ten sam worker pisze plik przez API; czat tylko linkuje. |
| **Apps Script** | Mostek „no-code” wywołujący HTTPS do workera z sekretem | Szybszy start, słabsza centralizacja — tymczasowo OK dla Project B. |

**Ingress:** Workspace **nigdy** nie zastępuje `EPIR_CHAT_SHARED_SECRET` w przeglądarce sklepu; to osobny kanał zaufania (S2S / OAuth serwer-serwer).

## 8. Okno czatu (już vs potem)

- **Już:** `GET …/internal/operator-studio` w `workers/chat` — panel operatora + modele Groq/OpenRouter.  
- **Potem:** cienki klient (np. bookmarklet / rozszerzenie) tylko jeśli musi żyć **poza** domeną workera — wtedy CORS + Access jeszcze ważniejsze.

## 9. Następne kroki inżynierskie (priorytet)

1. **Trzy narzędzia analityczne** w kanale `operator` (rola `analyst`): **`run_analytics_query`** (hurtownia), **`fetch_marketing_preview`** (GA4+Ads z `epir-marketing-ingest`), **`run_shopify_shopifyql`** (presety ShopifyQL / `read_reports`).  
2. **Profil operatora** w D1 + wstrzyknięcie do system prompt / pierwszej wiadomości (krótki).  
3. **Cron + raport** (tekst) + opcjonalnie e-mail Workspace.  
4. **HttpOnly cookie** zamiast `sessionStorage` dla panelu solo (mniejsza powierzchnia XSS).

---

*Ten dokument jest świadomie „wielkim pragnieniem” zmapowanym na fazami — żeby nie mylić marzenia z tym, co już jest w kodzie bez dodatkowej pracy.*
