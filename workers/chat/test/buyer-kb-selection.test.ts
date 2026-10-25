import {describe, expect, it, vi} from 'vitest';

import {
  kbEntryAssumesChatContext,
  selectTopKbEntries,
  KB_TOP_K,
} from '../src/buyer/kb-selection';
import {searchShopPoliciesViaMcp} from '../src/buyer/kb-policies';
import * as mcp from '../src/mcp_server';

describe('kb-selection', () => {
  it('rejects context-assuming FAQ (fantom 3D fixture)', () => {
    expect(
      kbEntryAssumesChatContext(
        'Twój projekt 3D pierścionka, który pokazałeś wcześniej, przesłania ten plik.',
      ),
    ).toBe(true);
  });

  it('selectTopKbEntries returns at most KB_TOP_K', () => {
    const entries = Array.from({length: 5}, (_, i) => ({
      question: `Pytanie ${i} adres pracowni`,
      answer: `Odpowiedź ${i} Traugutta`,
    }));
    const {entries: top} = selectTopKbEntries('adres pracowni Traugutta', entries);
    expect(top.length).toBeLessThanOrEqual(KB_TOP_K);
  });

  it('searchShopPoliciesViaMcp drops phantom entry and keeps visit facts', async () => {
    const faqs = [
      {
        question: 'Jaki jest adres Pracowni EPIR',
        answer: '50-419 Wrocław, ul. Traugutta 123/5.',
        source: {url: 'https://shop/faq/address'},
      },
      {
        question: 'Projekt 3D',
        answer: 'Twój projekt 3D pierścionka, który pokazałeś wcześniej.',
        source: {url: 'https://shop/faq/3d'},
      },
      {
        question: 'Telefon',
        answer: 'Zadzwoń pod numerem z zakładki kontakt.',
        source: {url: 'https://shop/faq/phone'},
      },
    ];
    vi.spyOn(mcp, 'callMcpToolDirect').mockResolvedValue({
      result: {
        content: [{type: 'text', text: JSON.stringify({faqs, policies: []})}],
      },
    });
    const r = await searchShopPoliciesViaMcp({} as import('../src/config/bindings').Env, 'adres pracowni');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer).toContain('Traugutta');
      expect(r.answer.toLowerCase()).not.toContain('pokazałeś');
      expect(r.answer.split('\n\n').length).toBeLessThanOrEqual(KB_TOP_K);
    }
  });
});
