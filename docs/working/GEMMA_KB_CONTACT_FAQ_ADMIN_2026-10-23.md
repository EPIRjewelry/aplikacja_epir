# Gemma KB — wymagana treść w Shopify Knowledge Base (Admin)

**Status:** materiał roboczy dla operatora (nie SSOT kodu).  
**Kontekst:** tor `polityki_kontakt` / `search_shop_policies_and_faqs` — Gemma **nie** może wpisywać numerów, adresów ani zasad wizyt w workerze ani w promptcie modelu.

## Kiedy ten dokument

Gdy w Observability `gemma.kb` pokazuje `has_answer=false` i `kb_reason=empty|mcp_error` na pytaniach o kontakt lub wizytę, mimo że routing kodu jest poprawny — **uzupełnij lub opublikuj artykuły KB** poniżej.

## Minimalny zestaw FAQ (tytuły sugerowane)

| Tytuł / pytanie w KB | Treść musi zawierać (fakty sklepu) |
| --- | --- |
| **Telefon do pracowni EPIR** | Główny numer obsługi klienta oraz numer wspólny (oba aktualne w Admin). |
| **Adres pracowni EPIR we Wrocławiu** | Ulica Traugutta 123/5, kod i miasto; krótki opis dojazdu jeśli jest w kanonie strony kontaktu. |
| **Wizyta w pracowni / przymierka** | Wizyty po wcześniejszym umówieniu; czy przymierka na miejscu jest możliwa; jak umówić termin (bez wymyślania procedury spoza KB). |
| **Godziny otwarcia / kontakt e-mail** | Jeśli publikowane na stronie kontaktu — spójnie z `/pages/kontakt`. |

## Weryfikacja po publikacji

1. W środowisku z MCP: zapytania NL „Jaki jest telefon?” i „Czy mogę obejrzeć biżuterię na żywo?” → `search_shop_policies_and_faqs` zwraca **niepusty** tekst (pole `answer`, tablica `faqs`, `answers[]` lub `content[].text` JSON).
2. Gemma v2: log `gemma.kb` z `has_answer=true`, `kb_reason=ok`.
3. Odpowiedź klienta **nie** równa się stałej `KB_POLICY_UNAVAILABLE_REPLY`.

## Zakaz w repo

Nie dodawać w `workers/chat/src` stałych z numerami telefonów, pełnym adresem ani regulaminem wizyt — wyłącznie parsowanie i routing do MCP/KB.
