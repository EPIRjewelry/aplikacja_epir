# EPIR Data Schema Contract

## Cel

Ten dokument definiuje kontrakt danych dla warstw Shopify, Cloudflare i analityki. Nie zastępuje kodu ani migracji, ale określa jakie typy danych są dopuszczalne, gdzie mieszkają i jak są rozdzielone między storefronty.

## Zasady modelowania danych

1. Shopify jest źródłem prawdy dla danych commerce.
2. Cloudflare jest źródłem prawdy dla stanu rozmowy i zdarzeń technicznych.
3. Złożone struktury treściowe przechowujemy preferencyjnie w **metaobjectach**, nie w rozbudowanych metafields JSON.
4. Dla zapisów `json` przez Admin API należy respektować limit platformy; duże konfiguracje należy rozbijać na metaobjects i referencje.
5. Każdy dokument lub rekord powiązany ze storefrontem powinien mieć możliwość przypisania do `storefrontId`.
6. Treść **polityk sklepu i FAQ wiążących** dla agentów AI: wyłącznie Shopify Knowledge Base / Storefront MCP — [`EPIR_KB_MCP_POLICY_CONTRACT.md`](EPIR_KB_MCP_POLICY_CONTRACT.md). D1, Vectorize i inne magazyny nie są źródłem normatywnym tej treści.

## Shopify: kluczowe metaobiekty

### `ai_profile`

Rola:

- opis tonu marki,
- wartości i zasad odpowiedzi,
- parametrów FAQ i promocji,
- profilu używanego przez worker dla konkretnego storefrontu.

Minimalne pola:

- `storefront_id`
- `brand_voice`
- `core_values`
- `faq_theme`
- `promotion_rules`

### `stone_profile`

Rola:

- wiedza gemmologiczna,
- opisy kamieni,
- pola edukacyjne wykorzystywane przez frontend i AI.

Przykładowe pola:

- `stone_name`
- `hardness`
- `mythology`
- `care_instructions`
- `birthstone_month`
- `epir_technique`

### `collection_enhanced`

Rola:

- warstwa treściowa i wizualna kolekcji,
- hero media, filozofia kolekcji, akcenty wizualne.

Przykładowe pola:

- `name`
- `hero_video`
- `texture_overlay`
- `philosophy`
- `accent_color`
- `lookbook_images`

## Shopify: produktowe metafields

Metafields mają zostać ograniczone do prostszych punktów danych i referencji.

Typowe pola w użyciu:

- `custom.main_collection`
- `custom.main_stone`
- `custom.metal_type`
- `custom.occasion_type`
- `custom.do_kompletu`
- `custom.czas_dostawy`

Pola preferowane jako referencje / dalszy kierunek:

- `custom.glowny_kamien` → `stone_profile`
- `custom.motyw_przewodni` → `collection_enhanced`
- `custom.mozliwosc_personalizacji`
- `custom.unikat`

## Cloudflare: stan rozmowy i pamięć

### D1 `ai-assistant-sessions-db`

Kluczowe obszary:

- `messages`
- `client_profiles`
- `person_memory`
- **`memory_facts`**, **`memory_events`**, **`memory_raw_turns`** (migracje 009–011; semantyczna pamięć klienta + audyt referencji)
- dane pomocnicze wykorzystywane przez Durable Objects

Rola:

- archiwizacja wiadomości,
- przechowywanie rozszerzonego stanu klienta,
- pamięć skrótowa między sesjami, jeśli została jawnie wdrożona,
- ustrukturyzowane fakty preferencji (`memory_facts`), ślad audytowy użycia narzędzi MCP / polityk (`memory_events`), surowe wypowiedzi użytkownika z limitem czasu (`memory_raw_turns`).

#### `memory_facts` (migracja 009)

**Cel:** trwałe, ustrukturyzowane fakty o preferencjach klienta (slot-filling), źródło dla deterministycznego skrótu `person_memory.summary` oraz dla retrievalu semantycznego (np. embeddingi w indeksie Vectorize `memory_customer`, warstwa aplikacji — patrz [`EPIR_MEMORY_ARCHITECTURE.md`](EPIR_MEMORY_ARCHITECTURE.md)).

**Powiązanie z tożsamością:** każdy rekord jest przypisany do **`shopify_customer_id`** (identyfikator klienta Shopify). Brak rekordów bez tego klucza.

**Zasady treści (KB / polityki):** pełny tekst wiążących polityk sklepu **nie** jest zapisywany w tej tabeli. Dotyk polityk jest odzwierciedlany wyłącznie w `memory_events` (audyt referencji). Szczegóły normatywne: [`EPIR_KB_MCP_POLICY_CONTRACT.md`](EPIR_KB_MCP_POLICY_CONTRACT.md).

| Kolumna | Typ | Opis |
|--------|-----|------|
| `id` | TEXT PK | Identyfikator rekordu |
| `shopify_customer_id` | TEXT NOT NULL | Klient Shopify (klucz partycji logicznej) |
| `slot` | TEXT NOT NULL | Slot faktu; dozwolone wartości (CHECK): `budget`, `metal`, `stone`, `ring_size`, `style`, `intent`, `event`, `product_interest`, `contact_pref`, `language` |
| `value` | TEXT NOT NULL | Wartość znormalizowana |
| `value_raw` | TEXT | Oryginalna fraza użytkownika (opcjonalnie) |
| `confidence` | REAL NOT NULL DEFAULT 0.5 | Pewność ekstrakcji |
| `source_session_id` | TEXT | Sesja źródłowa |
| `source_message_id` | TEXT | Wiadomość źródłowa |
| `source_kind` | TEXT NOT NULL DEFAULT `'extractor'` | Proweniencja zapisu |
| `created_at` | INTEGER NOT NULL | Unix epoch (ms) utworzenia |
| `expires_at` | INTEGER | Unix epoch (ms) wygaśnięcia rekordu (TTL per slot — warstwa aplikacji) |
| `superseded_by` | TEXT | Id nowego rekordu, który nadpisuje ten (łańcuch wersji tej samej preferencji) |

**Indeksy:** `idx_memory_facts_customer`, `idx_memory_facts_customer_slot`, `idx_memory_facts_expires_at`, `idx_memory_facts_superseded`; **UNIQUE** `uniq_memory_facts_dedup` na `(shopify_customer_id, slot, value, source_message_id)`.

**Retencja / RODO:** rekordy z `expires_at` mogą być usuwane po wygaśnięciu; pełne usunięcie danych klienta wymaga kasowania po `shopify_customer_id` (np. żądanie usunięcia danych, webhook `customers/redact`) — spójnie z operacjami erase w workerze czatu.

---

#### `memory_events` (migracja 010)

**Cel:** wyłącznie **referencje audytowe** dotyczące użycia polityk, FAQ, produktów lub koszyka — **bez** pełnego tekstu polityki jako nowego źródła prawdy. Umożliwia powiązanie „co zostało wywołane / kiedy” z `shopify_customer_id` i opcjonalnie `tool_call_id` (deduplikacja).

**Powiązanie z tożsamością:** **`shopify_customer_id`** — każdy zapis jest per klient.

| Kolumna | Typ | Opis |
|--------|-----|------|
| `id` | TEXT PK | Identyfikator zdarzenia |
| `shopify_customer_id` | TEXT NOT NULL | Klient Shopify |
| `kind` | TEXT NOT NULL | `policy_touch` \| `product_touch` \| `cart_touch` \| `faq_touch` (CHECK) |
| `ref_id` | TEXT NOT NULL | Referencja: np. identyfikator polityki, GID produktu, id koszyka |
| `ref_version` | TEXT | Wersja / etykieta wersji polityki (gdy znana) |
| `content_hash` | TEXT | Skrót treści z MCP (fallback audytu, nie drugi „kanon”) |
| `locale` | TEXT | Kontekst lokalizacji |
| `market` | TEXT | Kontekst rynku |
| `session_id` | TEXT | Sesja czatu |
| `tool_call_id` | TEXT | Id wywołania narzędzia (unikalność per klient, gdy NOT NULL) |
| `called_at` | INTEGER NOT NULL | Unix epoch (ms) momentu zapisu / wywołania |
| `meta_json` | TEXT | Dodatkowe metadane JSON (nie zastępują kanonu KB) |

**Indeksy:** `idx_memory_events_customer`, `idx_memory_events_customer_kind`, `idx_memory_events_called_at`; **UNIQUE** częściowy `uniq_memory_events_toolcall` na `(shopify_customer_id, tool_call_id)` WHERE `tool_call_id IS NOT NULL`.

**Retencja / RODO:** polityka retencji zdarzeń audytowych ustala się operacyjnie (np. archiwizacja / purge po czasie); przy żądaniu usunięcia danych klienta rekordy dla danego `shopify_customer_id` są usuwane w ramach tej samej operacji co pozostałe tabele pamięci.

---

#### `memory_raw_turns` (migracja 011)

**Cel:** przechowywanie **surowych wypowiedzi użytkownika** (`role = 'user'`) na potrzeby retrievalu z limitem czasu. Treść asystenta (w tym cytaty polityk) **nie** trafia do tej tabeli — zgodnie z [`EPIR_KB_MCP_POLICY_CONTRACT.md`](EPIR_KB_MCP_POLICY_CONTRACT.md).

**Powiązanie z tożsamością:** **`shopify_customer_id`**; dodatkowo **`session_id`** (powiązanie z konwersacją), opcjonalnie **`message_id`**.

| Kolumna | Typ | Opis |
|--------|-----|------|
| `id` | TEXT PK | Identyfikator wiersza |
| `shopify_customer_id` | TEXT NOT NULL | Klient Shopify |
| `session_id` | TEXT NOT NULL | Id sesji czatu |
| `message_id` | TEXT | Id wiadomości źródłowej |
| `role` | TEXT NOT NULL DEFAULT `'user'` | Musi być `'user'` (CHECK) |
| `text` | TEXT NOT NULL | Treść wypowiedzi (może być maskowana PII warstwą aplikacji) |
| `text_masked` | INTEGER NOT NULL DEFAULT 0 | Flaga maskowania |
| `created_at` | INTEGER NOT NULL | Unix epoch (ms) |
| `expires_at` | INTEGER NOT NULL | Unix epoch (ms) — **twardy horyzont retencji** |

**Retencja / RODO:** **`expires_at`** realizuje **twardy TTL** dla surowych wypowiedzi. Kontrakt operacyjny EPIR: **180 dni** od zapisu (wartość ustawiana w warstwie aplikacji przy insert; w schemacie D1 obowiązuje niepuste `expires_at` i okresowe czyszczenie wygasłych wierszy). Usunięcie na żądanie klienta: kasowanie po `shopify_customer_id` (wszystkie powiązane wiersze + synchronizacja z magazynami wektorowymi po stronie aplikacji).

**Indeksy:** `idx_memory_raw_turns_customer`, `idx_memory_raw_turns_expires_at`, `idx_memory_raw_turns_session`.

### Durable Objects

- `SessionDO` — aktywna sesja, historia runtime, metadane sesji
- `RateLimiterDO` — limity ruchu i throttling ochronny
- `TokenVaultDO` — anonimizacja i mapowanie identyfikatorów klientów

## Cloudflare: RAG i retrieval

### Vectorize

Warstwa wiedzy przechowuje embeddingi i metadane retrieval.

Minimalne metadane dokumentu powinny umożliwiać:

- rozróżnienie storefrontu,
- identyfikację typu źródła,
- bezpieczne cytowanie fragmentu.

Przykładowe pola metadanych:

- `storefront`
- `topic`
- `title`
- `path`
- `source`

## Analytics i hurtownia danych

### D1 `jewelry-analytics-db`

Kluczowe obszary:

- `pixel_events`
- `batch_exports`
- inne tabele zdarzeniowe tworzone przez analytics worker

### BigQuery `epir_jewelry`

Rola:

- długoterminowa analityka,
- raportowanie,
- korelacja zdarzeń z `session_id` i pipeline marketingowym.

Wymagania operacyjne:

- idempotentny eksport,
- partycjonowanie po czasie,
- sensowne klastrowanie po kluczach analitycznych.

## Reguły wielokanałowości

MUST:

- storefronty `kazka` i `zareczyny` mają własne profile i tokeny Storefront API,
- dane kontekstowe storefrontu nie mogą być mieszane między kanałami,
- dokumenty RAG i profile AI muszą być możliwe do ograniczenia do danego storefrontu.

## Kontrola publikacji danych

Przed użyciem metaobjectów w storefrontach należy potwierdzić:

- poprawnie skonfigurowany dostęp przez Storefront API,
- dostępność definicji i wpisów,
- zgodność odczytu z potrzebami storefrontu lub workera.

## Co sprawdzać przy review

- czy nowy typ danych naprawdę należy do Shopify, a nie do backendowego stanu,
- czy nie próbujemy przechowywać złożonej struktury w niewłaściwym metafieldzie,
- czy dane dla `kazka` i `zareczyny` dają się odseparować,
- czy analityka i pamięć nie obiecują więcej niż realnie przechowuje runtime.
