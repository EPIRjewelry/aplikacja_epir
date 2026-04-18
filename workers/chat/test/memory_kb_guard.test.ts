import { describe, expect, it } from 'vitest';

import {
  isPolicyToolName,
  isProductToolName,
  kbGuardCheck,
  maskPII,
} from '../src/memory/kb-guard';
import { classifyFragment, turnUsedPolicyTool } from '../src/memory/classifier';
import { extractFactsDeterministic, toMemoryFact } from '../src/memory/extractor';

describe('memory/kb-guard', () => {
  it('blokuje wynik tool-calla search_shop_policies_and_faqs', () => {
    const d = kbGuardCheck({ role: 'tool', text: '...policy content...', toolName: 'search_shop_policies_and_faqs' });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe('policy_tool_result');
  });

  it('blokuje wypowiedź asystenta w turze, w której był wołany KB-tool', () => {
    const d = kbGuardCheck({
      role: 'assistant',
      text: 'Zwroty przyjmujemy w ciągu 14 dni...',
      turnUsedPolicyTool: true,
    });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe('policy_cited_assistant');
  });

  it('blokuje tekst wyglądający na cytat z polityki', () => {
    const d = kbGuardCheck({ role: 'user', text: 'polityka zwrotów mówi że ...' });
    expect(d.allow).toBe(false);
    if (!d.allow) expect(d.reason).toBe('policy_text_like');
  });

  it('przepuszcza zwyczajną wypowiedź klienta', () => {
    const d = kbGuardCheck({ role: 'user', text: 'Szukam pierścionka z szafirem do 3000 zł' });
    expect(d.allow).toBe(true);
  });

  it('isPolicyToolName/isProductToolName', () => {
    expect(isPolicyToolName('search_shop_policies_and_faqs')).toBe(true);
    expect(isPolicyToolName('search_catalog')).toBe(false);
    expect(isProductToolName('search_catalog')).toBe(true);
    expect(isProductToolName('search_shop_policies_and_faqs')).toBe(false);
  });

  it('maska PII nadpisuje e-mail, telefon, kartę', () => {
    const { masked, changed } = maskPII('Mail: a.b@c.pl tel +48 501 234 567 karta 4111111111111111');
    expect(changed).toBe(true);
    expect(masked).toContain('[EMAIL]');
    expect(masked).toContain('[PHONE]');
    expect(masked).toContain('[CARD]');
  });
});

describe('memory/classifier', () => {
  it('low-signal user utterance → ignore', () => {
    const v = classifyFragment({ role: 'user', content: 'ok' }, { turnUsedPolicyTool: false });
    expect(v.kind).toBe('ignore');
  });

  it('pełna user wypowiedź → raw_user_turn', () => {
    const v = classifyFragment(
      { role: 'user', content: 'Szukam delikatnego pierścionka z brylantem na 2500 zł' },
      { turnUsedPolicyTool: false },
    );
    expect(v.kind).toBe('raw_user_turn');
  });

  it('tool policy → policy_touch', () => {
    const v = classifyFragment(
      { role: 'tool', content: '{}', toolName: 'search_shop_policies_and_faqs', toolCallId: 'tc_1' },
      { turnUsedPolicyTool: true },
    );
    expect(v.kind).toBe('policy_touch');
    if (v.kind === 'policy_touch') expect(v.toolCallId).toBe('tc_1');
  });

  it('assistant po policy-tool-call → ignore (KB clamp)', () => {
    const v = classifyFragment(
      { role: 'assistant', content: 'Zwroty przyjmujemy w 14 dni.' },
      { turnUsedPolicyTool: true },
    );
    expect(v.kind).toBe('ignore');
  });

  it('turnUsedPolicyTool rozpoznaje search_shop_policies_and_faqs', () => {
    expect(turnUsedPolicyTool([{ name: 'search_catalog' }, { name: 'search_shop_policies_and_faqs' }])).toBe(true);
    expect(turnUsedPolicyTool([{ name: 'search_catalog' }])).toBe(false);
  });
});

describe('memory/extractor (deterministic)', () => {
  it('wyciąga budget, ring_size, metal, stone', () => {
    const out = extractFactsDeterministic([
      'Szukam pierścionka z brylantem w srebrze, rozmiar 14, budżet 2500 zł',
    ]);
    const slots = out.map((f) => f.slot);
    expect(slots).toContain('budget');
    expect(slots).toContain('ring_size');
    expect(slots).toContain('metal');
    expect(slots).toContain('stone');
    const budget = out.find((f) => f.slot === 'budget');
    expect(budget?.value).toBe('2500');
    const ring = out.find((f) => f.slot === 'ring_size');
    expect(ring?.value).toBe('14');
  });

  it('rozpoznaje intent policy_question', () => {
    const out = extractFactsDeterministic(['Jaka jest polityka zwrotów?']);
    const intent = out.find((f) => f.slot === 'intent');
    expect(intent?.value).toBe('policy_question');
  });

  it('toMemoryFact dokleja id, TTL i customerId', () => {
    const [fact] = extractFactsDeterministic(['budget 1500 zł']);
    const memoryFact = toMemoryFact(fact, {
      shopifyCustomerId: 'gid://shopify/Customer/42',
      sourceSessionId: 'sess_1',
      sourceMessageId: 'msg_1',
      now: 1_000_000,
    });
    expect(memoryFact.shopifyCustomerId).toBe('gid://shopify/Customer/42');
    expect(memoryFact.sourceSessionId).toBe('sess_1');
    expect(memoryFact.slot).toBe('budget');
    expect(memoryFact.expiresAt).toBeGreaterThan(memoryFact.createdAt);
    expect(memoryFact.id).toMatch(/^fact_/);
  });
});
