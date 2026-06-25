/**
 * Sign in with Shop (Shop SDK login feature) for Gemma chat surfaces.
 * @see https://shopify.dev/docs/api/shop-sdk/reference/login
 */

const SHOP_SDK_LOADER =
  'https://cdn.shopify.com/shopifycloud/shop-js/modules/v2/loader.sdk.esm.js';

const SESSION_TOKEN_STORAGE_KEY = 'epir-shop-session-token';

type ShopSdkLoginCompleteEvent = {
  signedIn?: boolean;
  email?: string;
  customerAccessToken?: string;
};

type ShopLoginInstance = {
  element: HTMLElement;
  destroy?: () => void;
};

type ShopSdkInstance = {
  create: (
    feature: 'login',
    config: Record<string, unknown>,
  ) => Promise<ShopLoginInstance>;
};

type ShopSdkGlobal = {
  initialize: (config: Record<string, unknown>) => ShopSdkInstance;
};

let sdkLoaderPromise: Promise<void> | null = null;
let loginMountPromise: Promise<ShopLoginInstance | null> | null = null;

export function getStoredShopSessionToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const t = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    return t && t.trim() ? t.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function storeShopSessionToken(token: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (token && token.trim()) {
      sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token.trim());
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

async function loadShopSdk(): Promise<ShopSdkGlobal | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {ShopSDK?: ShopSdkGlobal};
  if (w.ShopSDK) return w.ShopSDK;

  if (!sdkLoaderPromise) {
    sdkLoaderPromise = import(/* @vite-ignore */ SHOP_SDK_LOADER).then(() => undefined);
  }
  await sdkLoaderPromise;
  return w.ShopSDK ?? null;
}

export type MountShopSignInOptions = {
  apiKey: string;
  locale?: string;
  mountSelector?: string;
  onSignedIn?: (token: string) => void;
};

/**
 * Mounts a standalone "Continue with Shop" button inside the chat chrome.
 * Returns a cleanup function.
 */
export async function mountShopSignInButton(
  options: MountShopSignInOptions,
): Promise<() => void> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey || typeof document === 'undefined') return () => {};

  const mountSelector = options.mountSelector ?? '#epir-shop-sign-in-mount';
  const mountEl = document.querySelector(mountSelector);
  if (!mountEl) return () => {};

  const ShopSDK = await loadShopSdk();
  if (!ShopSDK) return () => {};

  if (!loginMountPromise) {
    loginMountPromise = (async () => {
      const sdk = ShopSDK.initialize({
        apiKey,
        locale: options.locale ?? 'pl',
        features: {login: true},
      });
      const login = await sdk.create('login', {
        attributes: {
          buttonType: 'continue',
          buttonLayout: 'standalone',
        },
        onComplete(event: ShopSdkLoginCompleteEvent) {
          if (event.signedIn && event.customerAccessToken) {
            storeShopSessionToken(event.customerAccessToken);
            options.onSignedIn?.(event.customerAccessToken);
          }
        },
      });
      return login;
    })();
  }

  const login = await loginMountPromise;
  if (!login?.element) return () => {};

  mountEl.innerHTML = '';
  mountEl.appendChild(login.element);

  return () => {
    try {
      login.destroy?.();
    } catch {
      /* ignore */
    }
    mountEl.innerHTML = '';
  };
}

/**
 * Resolves bearer token for chat: stored Shop token, then window.shopify fallbacks.
 */
export async function resolveShopAuthTokenForChat(
  getSessionToken?: () => Promise<string | null | undefined>,
): Promise<string | undefined> {
  const stored = getStoredShopSessionToken();
  if (stored) return stored;

  if (getSessionToken) {
    try {
      const t = await getSessionToken();
      if (typeof t === 'string' && t.trim()) return t.trim();
    } catch {
      /* ignore */
    }
  }

  if (typeof window === 'undefined') return undefined;
  const shopify = (window as unknown as {
    shopify?: {
      sessionToken?: {get?: () => Promise<string>};
      id?: {token?: string};
    };
  }).shopify;

  if (shopify?.sessionToken?.get) {
    try {
      const t = await shopify.sessionToken.get();
      if (typeof t === 'string' && t.trim()) return t.trim();
    } catch {
      /* ignore */
    }
  }
  const idTok = shopify?.id?.token;
  if (typeof idTok === 'string' && idTok.trim()) return idTok.trim();

  return undefined;
}
