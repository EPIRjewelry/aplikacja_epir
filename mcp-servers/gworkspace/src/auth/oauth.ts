import { google } from 'googleapis';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from './keychain.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export function resolveOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.GWORKSPACE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GWORKSPACE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function createOAuth2Client(config: OAuthConfig) {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    process.env.GWORKSPACE_OAUTH_REDIRECT_URI?.trim() || 'http://127.0.0.1:43210/oauth2callback',
  );
}

export function getAuthorizationUrl(config: OAuthConfig): string {
  const client = createOAuth2Client(config);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCodeForRefreshToken(
  config: OAuthConfig,
  code: string,
): Promise<string> {
  const client = createOAuth2Client(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Brak refresh_token — powtórz autoryzację z prompt=consent');
  }
  await saveRefreshToken(tokens.refresh_token);
  return tokens.refresh_token;
}

export async function getAuthorizedClient() {
  const config = resolveOAuthConfig();
  if (!config) {
    throw new Error(
      'Ustaw GWORKSPACE_OAUTH_CLIENT_ID i GWORKSPACE_OAUTH_CLIENT_SECRET (lub uruchom bez API — tylko testy konwersji).',
    );
  }
  const refresh = await loadRefreshToken();
  if (!refresh) {
    throw new Error(
      'Brak refresh token w keychain. Uruchom: npm run auth -w @epir/mcp-gworkspace (lub ustaw GWORKSPACE_REFRESH_TOKEN).',
    );
  }
  const client = createOAuth2Client(config);
  client.setCredentials({ refresh_token: refresh });
  return client;
}

export async function authStatus(): Promise<{
  configured: boolean;
  hasToken: boolean;
  scopes: readonly string[];
}> {
  const configured = resolveOAuthConfig() !== null;
  const hasToken = Boolean(await loadRefreshToken());
  return { configured, hasToken, scopes: SCOPES };
}

export async function revokeLocalAuth(): Promise<void> {
  await clearRefreshToken();
}
