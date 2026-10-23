/** Fikcyjne payloady — bez prawdziwych ID klientów ani PII. */

export const FIKCYJNY_SESSION_ID = 'sess_fikcyjny-0001-aaaa-bbbb-cccc';

export const FIKCYJNY_USER_MESSAGE = 'Dzień dobry, szukam prezentu dla fikcyjnej osoby Anny K.';

export const geBuyerBody = (overrides: Record<string, unknown> = {}) => ({
  message: FIKCYJNY_USER_MESSAGE,
  session_id: FIKCYJNY_SESSION_ID,
  storefrontId: 'online-store',
  channel: 'online-store',
  brand: 'epir',
  stream: false,
  ...overrides,
});

export const gzBuyerBody = (overrides: Record<string, unknown> = {}) => ({
  message: FIKCYJNY_USER_MESSAGE,
  session_id: 'sess_fikcyjny-gz-0002-dddd-eeee-ffff',
  storefrontId: 'zareczyny',
  channel: 'hydrogen-zareczyny',
  brand: 'zareczyny',
  stream: false,
  ...overrides,
});

/** W allow-charset, ale bez prefiksu sess_ — worker może echo, nie jest to id czatu pixelu. */
export const FIKCYJNY_LEGACY_SESSION_TOKEN = 'widget-token-fikcyjny-01';

/** Kształt jak _shopify_y — nie używamy jako session_id odpowiedzi po mint. */
export const FIKCYJNY_SHOPIFY_Y_SHAPED = '8f3c1a20-6b14-4e2a-9c77-0a1b2c3d4e5f';
