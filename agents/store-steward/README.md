# Store Steward — Cursor SDK runner

## Env

```bash
export CURSOR_API_KEY="cursor_..."
export EPIR_ANALYST_ORIGIN="https://epir-analyst-worker.<subdomain>.workers.dev"
export ANALYST_HTTP_BEARER="..."   # wrangler secret na epir-analyst-worker
```

Nie używaj `EPIR_CHAT_SHARED_SECRET` ani bezpośredniego URL store-steward — analyst proxyuje RPC.

```bash
npm run report -w @epir/agent-store-steward
npm run report:dry -w @epir/agent-store-steward
```
