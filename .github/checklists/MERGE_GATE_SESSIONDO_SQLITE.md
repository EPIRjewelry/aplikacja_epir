# Merge Gate Checklist — SessionDO SQLite Migration (Hard Reject)

Status tej karty jest **binarny**:
- **PASS** = wszystkie wymagania spełnione.
- **HARD REJECT** = choć jedno wymaganie niespełnione.

> Zakres: PR migrujący `SessionDO` do `state.storage.sql` bez zmian pobocznych.

## 1) Scope Gate (autoryzacja zakresu)

### 1.1 Dozwolone pliki (IN SCOPE)
PR może zawierać wyłącznie poniższe ścieżki:

- `workers/chat/src/index.ts`
- `workers/chat/test/helpers/session-do-sql-stub.ts`
- `workers/chat/test/session_do.test.ts`
- `workers/chat/test/session_customer.test.ts`
- `workers/chat/test/ingress_s2s.test.ts`
- `workers/chat/test/consent_s2s.test.ts`
- `workers/chat/test/consent_app_proxy.test.ts`
- `workers/chat/test/app_proxy_ingress_hmac.test.ts`

- [ ] PASS / [ ] HARD REJECT — Diff PR zawiera wyłącznie pliki IN SCOPE.

### 1.2 Niedozwolone pliki (OUT OF SCOPE)
Poniższe ścieżki **muszą być wykluczone** z tego PR:

- `package.json`
- `package-lock.json`
- `tests/consent-gate.spec.ts`
- `test-results/**`

- [ ] PASS / [ ] HARD REJECT — Diff PR nie zawiera żadnej ścieżki OUT OF SCOPE.

---

## 2) Persistence Gate (integralność migracji)

- [ ] PASS / [ ] HARD REJECT — W `workers/chat/src/index.ts` brak użycia `storage.get` i `storage.put` dla `SessionDO`.
- [ ] PASS / [ ] HARD REJECT — `SessionDO` korzysta z `state.storage.sql` i inicjalizuje schemat.
- [ ] PASS / [ ] HARD REJECT — Schemat zawiera co najmniej: `session_context`, `session_customer`, `messages`, `replay_keys`, `product_views`, `proactive_chat_activations`.
- [ ] PASS / [ ] HARD REJECT — Kontrakt endpointów `SessionDO` pozostał kompatybilny (statusy/kształt odpowiedzi).

---

## 3) Security Gate (S2S + replay protection)

- [ ] PASS / [ ] HARD REJECT — Brak regresji autoryzacji S2S (`/chat`, `/consent`): shared secret + wymagane nagłówki kontekstowe.
- [ ] PASS / [ ] HARD REJECT — Brak regresji App Proxy HMAC (`/apps/assistant/chat`, `/apps/assistant/consent`).
- [ ] PASS / [ ] HARD REJECT — `/replay-check` zachowuje semantykę `used=false` (nowy), `used=true` (duplikat).
- [ ] PASS / [ ] HARD REJECT — Cleanup wygasłych replay keys działa (brak nieograniczonego narastania wpisów).

---

## 4) CI Gate (dowód wykonania)

Wymagane zielone wyniki CI dla testów związanych z migracją:

- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/session_do.test.ts`
- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/session_customer.test.ts`
- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/ingress_s2s.test.ts`
- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/consent_s2s.test.ts`
- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/consent_app_proxy.test.ts`
- [ ] PASS / [ ] HARD REJECT — `workers/chat/test/app_proxy_ingress_hmac.test.ts`

> Uwaga: testy Playwright storefrontowe są poza zakresem tego PR i nie mogą „dosypywać” plików OUT OF SCOPE.

---

## 5) Review & Approval Gate

- [ ] PASS / [ ] HARD REJECT — Co najmniej 1 zatwierdzenie code review od właściciela komponentu.
- [ ] PASS / [ ] HARD REJECT — Brak otwartych komentarzy blokujących (`Changes requested`).
- [ ] PASS / [ ] HARD REJECT — Brak force-push po ostatnim PASS bez ponownej walidacji tej karty.

---

## 6) Decyzja końcowa (binarnie)

- [ ] **PASS — MERGE DOZWOLONY**
- [ ] **HARD REJECT — MERGE ZABRONIONY**

Reguła: jeśli jakikolwiek punkt ma status HARD REJECT, decyzja końcowa automatycznie = **HARD REJECT**.

---

## 7) Metryka audytowa (do wypełnienia przy review)

- PR: `#____`
- Commit range: `____..____`
- Reviewer: `____`
- Data (UTC): `____`
- Wynik karty: `PASS / HARD REJECT`
- Uzasadnienie (1–3 zdania): `____`
