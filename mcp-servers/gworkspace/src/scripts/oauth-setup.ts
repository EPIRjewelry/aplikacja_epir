/**
 * Jednorazowa autoryzacja OAuth (lokalnie, poza stdio MCP).
 * npm run auth -w @epir/mcp-gworkspace
 */
import http from 'node:http';
import { URL } from 'node:url';
import {
  exchangeCodeForRefreshToken,
  getAuthorizationUrl,
  resolveOAuthConfig,
} from '../auth/oauth.js';

const PORT = 43210;

async function main(): Promise<void> {
  const config = resolveOAuthConfig();
  if (!config) {
    console.error('Ustaw GWORKSPACE_OAUTH_CLIENT_ID i GWORKSPACE_OAUTH_CLIENT_SECRET.');
    process.exit(1);
  }

  const url = getAuthorizationUrl(config);
  console.log('\nOtwórz w przeglądarce:\n', url, '\n');

  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
        if (u.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const code = u.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Brak code');
          reject(new Error('Brak code w callback'));
          return;
        }
        await exchangeCodeForRefreshToken(config, code);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p>OK — refresh token w keychain. Zamknij to okno.</p>');
        server.close();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    server.listen(PORT, '127.0.0.1');
  });

  console.log('Token zapisany w OS keychain (epir-mcp-gworkspace).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
