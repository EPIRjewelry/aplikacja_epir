/**
 * Kontrakt segmentów CRM → listy Customer Match (EPIR).
 */

export type CrmSegmentKey = 'consent' | 'high-value' | 'repeat';

export type CrmSegmentDef = {
  key: CrmSegmentKey;
  listName: string;
  description: string;
  /** Numeric user list ID (fallback gdy GAQL resolve). */
  userListId: string;
};

export const CRM_SEGMENTS: Record<CrmSegmentKey, CrmSegmentDef> = {
  consent: {
    key: 'consent',
    listName: 'EPIR_CRM_Email_Consent',
    description: 'Shopify — zgoda na email marketing',
    userListId: '9445880371',
  },
  'high-value': {
    key: 'high-value',
    listName: 'EPIR_CRM_High_Value',
    description: 'Shopify — zgoda + Total Spent >= 1000 PLN',
    userListId: '9445330403',
  },
  repeat: {
    key: 'repeat',
    listName: 'EPIR_CRM_Repeat',
    description: 'Shopify — zgoda + >= 2 zamówienia',
    userListId: '9445330454',
  },
};

export const ALL_CRM_SEGMENT_KEYS: CrmSegmentKey[] = ['consent', 'high-value', 'repeat'];

export type ShopifyCustomerRow = {
  email: string;
  firstName: string;
  lastName: string;
  emailMarketingConsent: boolean;
  totalSpent: number;
  totalOrders: number;
  tags: string[];
};

export function isTestCustomer(row: ShopifyCustomerRow): boolean {
  const email = row.email.trim().toLowerCase();
  const fn = row.firstName.trim().toLowerCase();
  if (!email) return true;
  if (fn === 'test') return true;
  if (/^test\d*@/.test(email)) return true;
  if (email.startsWith('test@')) return true;
  if (email.includes('@test.') || email.endsWith('@test.com')) return true;
  return false;
}

export function segmentFilter(key: CrmSegmentKey, row: ShopifyCustomerRow): boolean {
  if (!row.emailMarketingConsent || isTestCustomer(row)) return false;
  if (key === 'consent') return true;
  if (key === 'high-value') return row.totalSpent >= 1000;
  if (key === 'repeat') return row.totalOrders >= 2;
  return false;
}

export function resolveSegmentKeys(segment?: string): CrmSegmentKey[] {
  if (!segment || segment === 'all') return [...ALL_CRM_SEGMENT_KEYS];
  if (segment in CRM_SEGMENTS) return [segment as CrmSegmentKey];
  throw new Error(`unknown segment: ${segment}`);
}

export function segmentKeyByListName(listName: string): CrmSegmentKey | null {
  const trimmed = listName.trim();
  for (const key of ALL_CRM_SEGMENT_KEYS) {
    if (CRM_SEGMENTS[key].listName === trimmed) return key;
  }
  return null;
}
