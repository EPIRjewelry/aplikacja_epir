import {describe, expect, it, vi} from 'vitest';
import {
  collectAllowedUrls,
  foreignHostsInReply,
  guardBuyerReplyLinks,
  REPLY_LINK_REJECTED_MESSAGE,
} from '../src/buyer/reply-link-guard';
import * as aiClient from '../src/ai-client';

describe('reply-link-guard', () => {
  it('passes reply when link host is on allowlist', () => {
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/ring-a']);
    const foreign = foreignHostsInReply(
      'Polecam [Pierścionek](https://epirbizuteria.pl/products/ring-a).',
      allowed,
    );
    expect(foreign).toEqual([]);
  });

  it('flags example.com when not on allowlist', () => {
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/ring-a']);
    const foreign = foreignHostsInReply(
      'Zobacz [X](https://example.com/foo).',
      allowed,
    );
    expect(foreign).toContain('example.com');
  });

  it('rejects after retry still contains foreign link', async () => {
    vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue(
      'Nadal [zły](https://example.com/x).',
    );
    const allowed = collectAllowedUrls(['https://epirbizuteria.pl/products/a']);
    const out = await guardBuyerReplyLinks(
      {} as import('../src/config/bindings').Env,
      'Link [zły](https://example.com/y).',
      allowed,
      {systemBase: 'sys'},
    );
    expect(out).toBe(REPLY_LINK_REJECTED_MESSAGE);
  });
});
