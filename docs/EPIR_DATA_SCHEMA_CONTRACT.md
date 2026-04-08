# EPIR Data Schema Contract

## Cel

Ten dokument definiuje kontrakt danych dla warstw Shopify, Cloudflare i analityki. Nie zastępuje kodu ani migracji, ale określa jakie typy danych są dopuszczalne, gdzie mieszkają i jak są rozdzielone między storefronty.

## Zasady modelowania danych

1. Shopify jest źródłem prawdy dla danych commerce.
2. Cloudflare jest źródłem prawdy dla stanu rozmowy i zdarzeń technicznych.
3. Złożone struktury treściowe przechowujemy preferencyjnie w **metaobjectach**, nie w rozbudowanych metafields JSON.
4. Dla zapisów `json` przez Admin API należy respektować limit platformy; duże konfiguracje należy rozbijać na metaobjects i referencje.
5. Każdy dokument lub rekord powiązany ze storefrontem powinien mieć możliwość przypisania do `storefrontId`.

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
- dane pomocnicze wykorzystywane przez Durable Objects

Rola:

- archiwizacja wiadomości,
- przechowywanie rozszerzonego stanu klienta,
- pamięć skrótowa między sesjami, jeśli została jawnie wdrożona.

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
