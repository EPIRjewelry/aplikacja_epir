/**
 * Poświadczenia OAuth — wyłącznie lokalny OS keychain (plan: trust model).
 */
import keytar from 'keytar';

export const KEYCHAIN_SERVICE = 'epir-mcp-gworkspace';
export const KEYCHAIN_ACCOUNT = 'oauth-refresh-token';

export async function loadRefreshToken(): Promise<string | null> {
  const fromEnv = process.env.GWORKSPACE_REFRESH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    return await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch {
    /* ignore */
  }
}
