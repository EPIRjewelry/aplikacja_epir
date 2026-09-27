import { describe, expect, it } from 'vitest';
import {
  FREEZE_PAGE_FEED_URLS,
  planMissingPageFeedUrls,
  planTextAutomationOptIn,
  urlsMatchFreezeSet,
} from './ads-pmax-page-feed';

describe('ads-pmax-page-feed', () => {
  it('plans missing URLs only', () => {
    const missing = planMissingPageFeedUrls([
      FREEZE_PAGE_FEED_URLS[0],
      FREEZE_PAGE_FEED_URLS[2],
    ]);
    expect(missing).toHaveLength(2);
    expect(urlsMatchFreezeSet(FREEZE_PAGE_FEED_URLS)).toBe(true);
  });

  it('text automation opt-in when absent', () => {
    const { needsUpdate, next } = planTextAutomationOptIn([]);
    expect(needsUpdate).toBe(true);
    expect(next.some((r) => r.assetAutomationType === 'TEXT_ASSET_AUTOMATION')).toBe(true);
  });
});
