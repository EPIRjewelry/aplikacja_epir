# Wdrożenie produkcyjne: cross-session memory (MVP `person_memory`)

> Dokument operacyjny — **tylko ścieżka produkcyjna**, bez osobnego etapowania „dev”. Zakładasz świadome ryzyko zmian na żywym środowisku.

**Źródła prawdy (architektura / zgodność):** `EPIR_AI_ECOSYSTEM_MASTER.md`, `EPIR_AI_BIBLE.md`, `docs/NOTEBOOKLM_EPIR_CHAT_INGRESS.md` §8.

**Kontekst techniczny w repo:**

- Worker czatu: `workers/chat/` (`wrangler.toml`, katalog `migrations/`).
- W kodzie binding D1 to **`DB_CHATBOT`**; w CLI Wranglera do migracji używasz **nazwy bazy** z `wrangler.toml`: **`ai-assistant-sessions-db`** (nie myl z nazwą bindingu).
- W tym repozytorium **`workers/chat/wrangler.toml` nie definiuje `[env.production]`** — konfiguracja domyślna jest już pod trasę `asystent.epirbizuteria.pl/*`. Produkcja = **baza zdalna (`--remote`)** oraz **`wrangler deploy`** bez `--env`.

---

## 1. Krok 1 — Migracje D1 na produkcyjnej bazie (chat)

1. Przejdź do katalogu workera czatu:

   ```bash
   cd workers/chat
   ```

2. Sprawdź pliki migracji (powinna być m.in. **`004_person_memory.sql`**):

   ```bash
   ls migrations
   ```

3. Zastosuj migracje na **zdalnej** bazie powiązanej z chatem:

   ```bash
   wrangler d1 migrations apply ai-assistant-sessions-db --remote
   ```

   Jeżeli w przyszłości dodacie osobne środowiska w `wrangler.toml` (`[env.prod]` itd.), użyjecie **tego samego** `--env`, które wskazuje na produkcyjną bazę — w obecnym stanie repo komenda powyżej jest właściwa dla produkcji.

4. Zweryfikuj, że tabela **`person_memory`** istnieje:

   **Bash**

   ```bash
   wrangler d1 execute ai-assistant-sessions-db --remote \
     --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
   ```

   **PowerShell (Windows)**

   ```powershell
   wrangler d1 execute ai-assistant-sessions-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
   ```

   Na liście powinna być m.in. **`person_memory`** (oraz wcześniejsze tabele z migracji 001–003, jeśli były już wdrożone).

---

## 2. Krok 2 — Deploy workera czatu na produkcję

**Kolejność jest krytyczna:** najpierw **migracje D1** (Krok 1), dopiero potem **deploy kodu**, który czyta/zapisuje `person_memory`. Odwrotnie grozi błędami przy pierwszym użyciu tabeli.

### Ręcznie (Wrangler)

Z katalogu `workers/chat`:

```bash
wrangler deploy
```

(bez `--env`, dopóki domyślna konfiguracja w `wrangler.toml` = produkcja pod `asystent.epirbizuteria.pl`).

### CI / pipeline

Upewnij się, że:

- deployowana jest **ta sama rewizja kodu**, co migracja `004_person_memory.sql`;
- pipeline trafia na **tę samą** zdalną bazę `ai-assistant-sessions-db` (ten sam account / ta sama nazwa bazy co w `wrangler.toml`).

---

## 3. Krok 3 — Smoke testy na produkcji

### Scenariusz A — zalogowany klient (App Proxy, memory ON)

Na **produkcyjnym** sklepie:

1. Zaloguj się jako realny lub testowy klient Shopify.
2. Otwórz czat tak, aby ruch szedł przez **App Proxy** → `POST` pod `/apps/assistant/chat` (TAE lub Hydrogen — zgodnie z Waszym storefrontem).

**Sesja 1**

- Podaj jednoznaczne preferencje, np. „Lubię żółte złoto”, „Rozmiar pierścionka: 13”.
- Zamknij czat / przejdź dalej (zakończ interakcję).

**Sesja 2 (nowa sesja)**

- Odśwież stronę lub nowa karta; jeśli możesz — potwierdź nowe `session_id` (network / storage).
- Napisz coś neutralnego, np. „Szukam pierścionka zaręczynowego”.

**Oczekiwane:** asystent w którymś momencie nawiązuje do wcześniejszych preferencji (np. żółte złoto, rozmiar 13), zgodnie z §8 w `NOTEBOOKLM_EPIR_CHAT_INGRESS.md`.

**Logi (opcjonalnie):** przy drugim wejściu widoczny odczyt kontekstu z `person_memory`; po odpowiedzi — ścieżka zapisu/odświeżenia (np. `waitUntil` / merge).

### Scenariusz B — gość (App Proxy, memory OFF)

1. Incognito lub wylogowany klient — ta sama domena sklepu.
2. Powtórz analogicznie: sesja 1 z preferencjami → nowa sesja → neutralne pytanie.

**Oczekiwane:** brak trwałego „pamiętania” szczegółów między sesjami (zachowanie jak przed MVP cross-session memory dla gościa bez `logged_in_customer_id`).

### Scenariusz C — S2S `/chat` (memory OFF)

Z narzędzia serwerowego (curl, Postman, wewnętrzny klient):

- `POST https://asystent.epirbizuteria.pl/chat`
- Nagłówki: `X-EPIR-SHARED-SECRET`, `X-EPIR-STOREFRONT-ID`, `X-EPIR-CHANNEL` (kontrakt S2S).
- **Bez** identyfikacji klienta w stylu `logged_in_customer_id` w query/body (jeśli Wasz kontrakt tego nie dodaje).

**Oczekiwane:**

- odpowiedź **2xx**, brak **5xx** z powodu `person_memory`;
- brak wykorzystania trwałej pamięci międzysesyjnej w odpowiedziach;
- w logach brak sensownych odczytów/zapisów `person_memory` dla tej ścieżki (kanał bez powiązania z osobą).

---

## 4. Po smoke testach

Jeśli A/B/C są zgodne z oczekiwaniami:

- MVP cross-session memory można uznać za **wdrożone** i spójne z dokumentacją: pamięć **tylko** przy zalogowanym kliencie przez App Proxy (`logged_in_customer_id`), **bez** pamięci dla gościa, **bez** pamięci na S2S `/chat` bez identyfikacji osoby.

**Później (poza tą checklistą):** retention `person_memory`, rozszerzenie summary, copy/UI („pamiętam preferencje z wcześniejszych rozmów”) — decyzje produktowe.

**Gdy coś się rozjeżdża** (np. gość „pamięta”, S2S dotyka D1): zbierz konkretny request (nagłówki, ścieżka, fragment logów) i zweryfikuj kod w `workers/chat/src/index.ts` oraz `person-memory.ts` względem tej checklisty.
