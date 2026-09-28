export {parseSection} from './parseSection';
export {
  getStoreFrontClient,
  storefrontHeadersFromRequest,
  type StorefrontEnv,
  type StorefrontContext,
} from './hydrogen';
export {
  EPIR_SESSION_CART_ATTR_KEY,
  EPIR_STOREFRONT_CART_ATTR_KEY,
  ensureStorefrontCartAttribute,
  mergeCartAttributes,
  readEpirStorefrontFromAttributes,
  sessionCartAttributeInput,
  storefrontCartAttributeInput,
  withStorefrontCartInput,
  type EpirStorefrontCartValue,
} from './epir-cart-attributes';
export {
  EPIR_SESSION_COOKIE_NAME,
  EPIR_SHOPIFY_Y_COOKIE_NAME,
  readEpirSessionIdFromCookieHeader,
  readNamedCookieFromHeader,
  readShopifyYFromCookieHeader,
  resolveEpirAnalyticsSessionId,
  resolveEpirAnalyticsSessionIdFromCookieHeader,
  type ResolveEpirAnalyticsSessionIdInput,
  type ResolveEpirAnalyticsSessionIdResult,
} from './epir-session-cookie';
