import { describe, expect, it } from 'vitest';
import {
  CRM_SEGMENTS,
  isTestCustomer,
  segmentFilter,
  segmentKeyByListName,
} from './customer-match-config';

describe('customer-match-config', () => {
  it('filters consent segment', () => {
    const row = {
      email: 'buyer@example.com',
      firstName: 'A',
      lastName: 'B',
      emailMarketingConsent: true,
      totalSpent: 50,
      totalOrders: 1,
      tags: [],
    };
    expect(segmentFilter('consent', row)).toBe(true);
    expect(segmentFilter('high-value', row)).toBe(false);
    expect(segmentFilter('repeat', row)).toBe(false);
  });

  it('excludes test accounts', () => {
    expect(
      isTestCustomer({
        email: 'test@example.com',
        firstName: 'x',
        lastName: 'y',
        emailMarketingConsent: true,
        totalSpent: 0,
        totalOrders: 0,
        tags: [],
      }),
    ).toBe(true);
  });

  it('maps list names to segment keys', () => {
    expect(segmentKeyByListName(CRM_SEGMENTS.consent.listName)).toBe('consent');
    expect(segmentKeyByListName('unknown')).toBeNull();
  });
});
