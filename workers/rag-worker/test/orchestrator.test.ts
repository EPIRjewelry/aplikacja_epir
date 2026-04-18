import { describe, it, expect, vi } from 'vitest';
import {
  detectIntent,
  isBindingPolicyQuery,
  orchestrateRag,
  type UserIntent,
} from '../src/domain/orchestrator';

describe('detectIntent', () => {
  it('returns "cart" for Polish cart keywords', () => {
    const cartQueries = [
      'co mam w koszyku',
      'pokaż koszyk',
      'dodaj do koszyka',
      'zawartość koszyka',
      'usuń z koszyka',
      'aktualizuj koszyk',
    ];
    for (const q of cartQueries) {
      expect(detectIntent(q), `Expected cart for: "${q}"`).toBe('cart');
    }
  });

  it('returns "cart" for English cart keywords', () => {
    const cartQueries = ['show cart', 'add to cart', 'my cart', 'update cart'];
    for (const q of cartQueries) {
      expect(detectIntent(q), `Expected cart for: "${q}"`).toBe('cart');
    }
  });

  it('returns "order" for Polish order keywords', () => {
    const orderQueries = [
      'status zamówienia',
      'moje zamówienie',
      'gdzie jest paczka',
      'kiedy dotrze przesyłka',
      'ostatnie zamówienie',
      'śledzenie przesyłki',
    ];
    for (const q of orderQueries) {
      expect(detectIntent(q), `Expected order for: "${q}"`).toBe('order');
    }
  });

  it('returns "order" for English order keywords', () => {
    const orderQueries = ['order status', 'track my order', 'recent order', 'where is my package'];
    for (const q of orderQueries) {
      expect(detectIntent(q), `Expected order for: "${q}"`).toBe('order');
    }
  });

  it('returns "faq" for Polish FAQ/policy keywords', () => {
    const faqQueries = [
      'polityka zwrotów',
      'jak zrobić zwrot',
      'wysyłka do Polski',
      'dostawa do domu',
      'reklamacja produktu',
      'gwarancja na biżuterię',
    ];
    for (const q of faqQueries) {
      expect(detectIntent(q), `Expected faq for: "${q}"`).toBe('faq');
    }
  });

  it('returns "faq" for English FAQ keywords', () => {
    const faqQueries = ['return policy', 'shipping time', 'delivery options', 'warranty info'];
    for (const q of faqQueries) {
      expect(detectIntent(q), `Expected faq for: "${q}"`).toBe('faq');
    }
  });

  it('returns "search" for product search queries (default)', () => {
    const searchQueries = [
      'Jakie masz pierścionki?',
      'szukam kolczyków złotych',
      'pokaż mi bransoletki',
      'co polecasz jako prezent',
    ];
    for (const q of searchQueries) {
      expect(detectIntent(q), `Expected search for: "${q}"`).toBe('search');
    }
  });

  it('routes adversarial policy queries to "faq" via isBindingPolicyQuery safety net', () => {
    // No surface `faqKeyword` match, but isBindingPolicyQuery flags these.
    expect(detectIntent('jak odesłać prezent?')).toBe('faq');
    expect(detectIntent('kiedy kurier przyjedzie z moją paczką?')).toBe('faq');
    expect(detectIntent('I just want to know how to send it back for a refund')).toBe('faq');
  });

  it('cart intent takes priority over other intents', () => {
    // A query mentioning both cart and order should resolve to cart
    expect(detectIntent('dodaj zamówienie do koszyka')).toBe('cart');
  });

  it('is case-insensitive', () => {
    expect(detectIntent('KOSZYK')).toBe('cart');
    expect(detectIntent('STATUS ZAMÓWIENIA')).toBe('order');
    expect(detectIntent('POLITYKA ZWROTÓW')).toBe('faq');
  });
});

describe('isBindingPolicyQuery (KB-clamp)', () => {
  it('PL: returns / refund / exchange / withdrawal — all flavours', () => {
    const q = [
      'polityka zwrotów',
      'czy mogę zwrócić zamówienie?',
      'zwracam naszyjnik, co dalej?',
      'jak odesłać prezent?',                    // adversarial: „prezent”
      'odsyłam bransoletkę, proszę o zwrot kosztów',
      'chcę wymienić pierścionek na inny rozmiar',
      'odstąpienie od umowy po 14 dniach',
      'mam 30 dni na reklamację?',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('PL: warranty / complaint / repair / rękojmia', () => {
    const q = [
      'reklamacja biżuterii',
      'naprawa zapięcia bransolety',
      'gwarancja na pierścionek zaręczynowy',
      'rękojmia a gwarancja — różnice',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('PL: shipping / delivery / courier / costs / fees', () => {
    const q = [
      'koszt dostawy do Niemiec',
      'darmowa wysyłka od 300 zł?',
      'wysyłka kurierem InPost',
      'czas realizacji zamówienia',
      'paczkomat czy kurier DHL?',
      'śledzenie przesyłki — gdzie jest?',      // "przesyłk"
      'opłata za dostawę ekspresową',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('PL: terms / privacy / GDPR / invoicing', () => {
    const q = [
      'regulamin sklepu',
      'polityka prywatności',
      'polityka plików cookies',
      'RODO — dane osobowe',
      'ochrona danych osobowych',
      'czy wystawicie fakturę VAT?',
      'czy dostanę paragon?',
      'prawo konsumenta — odstąpienie',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('EN: returns / refund / warranty / shipping / terms / privacy', () => {
    const q = [
      'return policy for EU',
      'refund to original payment method',
      'exchange size of a ring',
      'money-back guarantee?',
      'cooling-off period in Poland',
      'warranty details on silver',
      'complaint about a broken clasp',
      'shipping cost to Poland',
      'delivery times and couriers',
      'do you offer free shipping?',
      'terms of service',
      'T&Cs of the store',
      'privacy policy',
      'GDPR data request',
      'consumer rights in EU',
      'statutory rights',
      'tracking my parcel',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('Adversarial prompts — still classified as binding (over-detect on purpose)', () => {
    const adversarial = [
      // Tries to disguise a return as a gift-related question.
      'jak odesłać prezent?',
      // Obfuscates "zwrot" with mixed casing + noise.
      'Co Z TyM ZwRotEM zrobić, jak odesłać?',
      // English framing to slip past PL keywords.
      'I just want to know how to send it back for a refund',
      // Implicit shipping question without the word "wysyłka".
      'kiedy kurier przyjedzie z moją paczką?',
    ];
    for (const s of adversarial) {
      expect(isBindingPolicyQuery(s), `expected binding (adversarial) for: "${s}"`).toBe(true);
    }
  });

  it('Non-policy questions — not binding (Vectorize allowed)', () => {
    const q = [
      'jakie macie pierścionki zaręczynowe?',
      'polecisz naszyjnik na prezent?',
      'opowiedz o kolekcji Kazka',
      'What gemstones do you sell?',
      'Czym różni się szafir od rubinu?',
      'Pokaż kolczyki ze srebra.',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected NOT binding for: "${s}"`).toBe(false);
    }
  });

  it('Soft exemption: "FAQ o kolekcji" stays non-binding when no strong signal present', () => {
    expect(isBindingPolicyQuery('FAQ o kolekcji Kazka')).toBe(false);
    expect(isBindingPolicyQuery('pytania i odpowiedzi o pielęgnacji srebra')).toBe(false);
  });

  it('Soft exemption DOES NOT override strong binding signal in the same query', () => {
    expect(
      isBindingPolicyQuery('FAQ o kolekcji Kazka — ale też polityka zwrotów'),
    ).toBe(true);
  });

  it('Mixed PL+EN in one utterance — still binding', () => {
    const q = [
      'Chcę refund — jak zrobić zwrot pierścionka?',
      'shipping do UK: ile kosztuje delivery i czy jest free shipping?',
      'return policy vs polityka zwrotów — to samo?',
      'GDPR request + RODO: usuń moje dane osobowe',
    ];
    for (const s of q) {
      expect(isBindingPolicyQuery(s), `expected binding for: "${s}"`).toBe(true);
    }
  });

  it('Typos / ASCII spellings — still caught (zwruot, prywatnosc)', () => {
    expect(isBindingPolicyQuery('jak zrobic zwruot naszyjnika')).toBe(true);
    expect(isBindingPolicyQuery('prywatnosc danych w sklepie')).toBe(true);
  });

  it('EN: bare "policy" / non-store "policy" — not binding (narrowed patterns)', () => {
    expect(isBindingPolicyQuery('foreign policy in the news')).toBe(false);
    expect(isBindingPolicyQuery('what is policy')).toBe(false);
  });

  it('EN: contextual policy phrases — binding', () => {
    expect(isBindingPolicyQuery('our return policy')).toBe(true);
    expect(isBindingPolicyQuery('your privacy policy')).toBe(true);
    expect(isBindingPolicyQuery('policies regarding shipping')).toBe(true);
  });
});

describe('KB-clamp structured log (raw_query, metric: kb_clamp_blocked_total)', () => {
  it('emits a single console.warn with raw_query + metric when binding MCP is unavailable', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await orchestrateRag({
      query: 'polityka zwrotów 30 dni',
      intent: 'faq',
      // no mcpEndpoint → MCP unreachable → binding path triggers KB-clamp
      locale: 'pl-PL',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('POLICY_SYSTEM_UNAVAILABLE');
    }

    const structuredCalls = warnSpy.mock.calls
      .map(([arg]) => (typeof arg === 'string' ? arg : ''))
      .filter((s) => s.includes('"metric":"kb_clamp_blocked_total"'));

    expect(structuredCalls).toHaveLength(1);
    const payload = JSON.parse(structuredCalls[0]);
    expect(payload).toMatchObject({
      event: 'POLICY_SYSTEM_UNAVAILABLE',
      metric: 'kb_clamp_blocked_total',
      code: 'POLICY_SYSTEM_UNAVAILABLE',
      intent: 'faq',
      locale: 'pl-PL',
      source: 'rag-worker',
      raw_query: 'polityka zwrotów 30 dni',
    });
    expect(payload).not.toHaveProperty('query_hash');

    warnSpy.mockRestore();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  E2E SCENARIOS — KB-clamp ("Policy Oracle") circuit breaker
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Exercise the full path: client → chat worker → RAG worker → MCP (mocked empty
 *  or error) → expected HTTP 503 + code `POLICY_SYSTEM_UNAVAILABLE`, with NO
 *  Vectorize fallback for binding queries. Non-binding queries MUST still use
 *  Vectorize when MCP is empty.
 *
 *  Suggested runner: Miniflare/Vitest with a fake MCP endpoint + a fake
 *  Vectorize binding that records `query()` calls so we can assert it was
 *  (or was not) invoked.
 *
 *  ▸ Scenario 1 — Binding: RETURNS, MCP empty → 503 POLICY_SYSTEM_UNAVAILABLE
 *    Request:   POST /search/policies  { "query": "polityka zwrotów 30 dni" }
 *    MCP mock:  returns 200 with `{ content: [] }` (no matches)
 *    Expect:
 *      - HTTP 503
 *      - JSON: { ok: false, code: "POLICY_SYSTEM_UNAVAILABLE",
 *                error: { code: "POLICY_SYSTEM_UNAVAILABLE" } }
 *      - Vectorize index `query()` NOT called
 *      - Chat surface prompt includes the "[SYSTEM: Policy service unavailable …]"
 *        marker and the model must respond with a controlled "nie wiem / system
 *        niedostępny" message.
 *
 *  ▸ Scenario 2 — Adversarial: "jak odesłać prezent?" → treated as binding
 *    Request:   POST /search/policies  { "query": "jak odesłać prezent?" }
 *    MCP mock:  HTTP 500 (upstream error)
 *    Expect:
 *      - HTTP 503
 *      - JSON: { ok: false, code: "POLICY_SYSTEM_UNAVAILABLE" }
 *      - Vectorize index `query()` NOT called (KB-clamp triggered by
 *        `isBindingPolicyQuery` even though the word "zwrot" is absent).
 *      - Metric: `kb_clamp_blocked_total` increments (observability hook).
 *
 *  ▸ Scenario 3 — Non-binding FAQ: educational content, MCP empty → Vectorize OK
 *    Request:   POST /search/policies  { "query": "pytania i odpowiedzi o pielęgnacji srebra" }
 *    MCP mock:  returns 200 with `{ content: [] }`
 *    Expect:
 *      - HTTP 200
 *      - JSON: { ok: true, context: "...[FAQ/INFO (Vectorize — non-binding)]..." }
 *      - Vectorize index `query()` called exactly once with top-K default
 *      - No POLICY_SYSTEM_UNAVAILABLE code anywhere in the response.
 *
 *  ▸ Scenario 4 — Binding + soft-exemption collision: mixed query
 *    Request:   POST /search/policies
 *                 { "query": "FAQ o kolekcji Kazka — ale też polityka zwrotów" }
 *    MCP mock:  returns 200 with `{ content: [] }`
 *    Expect:
 *      - HTTP 503
 *      - JSON: { ok: false, code: "POLICY_SYSTEM_UNAVAILABLE" }
 *      - Vectorize index `query()` NOT called (strong binding token
 *        "polityka zwrotów" overrides the soft exemption).
 *
 *  Pre-merge gate for `main`:
 *    - All four scenarios MUST pass in CI (Miniflare + mocked MCP + fake Vectorize).
 *    - Regression: an MCP outage on a binding query must NEVER surface Vectorize
 *      content in the worker response body, logs, or metrics.
 */
