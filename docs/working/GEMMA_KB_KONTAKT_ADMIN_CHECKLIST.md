# Gemma KB — kontakt / wizyta / przymiarka (Shopify Admin)

**Status:** treść w Shopify Knowledge Base (nie w kodzie workerów).  
**Cel smoke:** `search_shop_policies_and_faqs` zwraca niepusty `answer`; w logach `gemma.kb` → `has_answer: true` (nie `kb_reason: empty|mcp_error`).

## Minimalne artykuły / FAQ w KB

Utwórz lub uzupełnij wpisy tak, aby wyszukiwanie po poniższych pytaniach zwracało **konkretne fakty** (tytuł + treść widoczne w MCP):

### 1. Telefon i kontakt

**Sugerowany tytuł FAQ:** `Kontakt — telefon i e-mail pracowni EPIR`

**Treść (przykład struktury — wartości muszą być aktualne w Admin):**

- Telefon pracowni (EPIR): …
- Telefon wspólny / infolinia (jeśli dotyczy): …
- E-mail kontaktowy (jeśli publikowany): …
- Krótka informacja, że to oficjalne kanały kontaktu ze sklepem/pracownią.

**Smoke pytania klienta:**

- „jaki jest telefon?”
- „podaj numer telefonu do pracowni”

### 2. Adres i dojazd

**Sugerowany tytuł FAQ:** `Adres pracowni EPIR — Wrocław, ul. Traugutta`

**Treść:**

- Pełny adres (np. 50-419 Wrocław, ul. Traugutta 123/5).
- Piętro / wejście, jeśli istotne dla klientów.
- Link do strony kontaktowej w `sources`, jeśli MCP to eksponuje.

**Smoke:** „jaki jest adres pracowni?”

### 3. Wizyta i przymiarka na żywo

**Sugerowany tytuł FAQ:** `Wizyta w pracowni i przymiarka biżuterii`

**Treść:**

- Czy można obejrzeć biżuterię na żywo w pracowni.
- Wizyty po wcześniejszym umówieniu (jeśli tak obowiązuje).
- Czego nie obiecywać w KB (np. „bez umówienia 24/7”) — tylko fakty operacyjne.

**Smoke pytania:**

- „mogę obejrzeć na żywo?”
- „czy mogę przyjść na przymiarkę?”

## Weryfikacja po publikacji w Admin

1. Observability na buyer worker: filtr `gemma.kb`, pytania jak wyżej → `has_answer: true`, `kb_reason: ok`.
2. Odpowiedź klienta **nie** może być stałym `KB_POLICY_UNAVAILABLE_REPLY` (tekst z `kb-policies.ts`).
3. Gemma może cytować wyłącznie `answer` z MCP — bez numerów wpisanych w repo.

## Zakres kodu (PR KB routing)

Worker: routing `policy_query` / heurystyka kontakt, retry szerokiego zapytania KB (słowa kluczowe, bez numerów), testy jednostkowe. **Nie zastępuje** powyższych artykułów w Admin.
