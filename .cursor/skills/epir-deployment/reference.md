# EPIR Deployment – szczegóły

## Instalacja narzędzi

### Windows (PowerShell)

```powershell
# Node.js – pobierz z nodejs.org lub winget
winget install OpenJS.NodeJS.LTS

# Wrangler
npm install -g wrangler

# Shopify CLI
npm install -g @shopify/cli @shopify/theme
```

### Linux / macOS

```bash
# Node.js (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18

# Wrangler
npm install -g wrangler

# Shopify CLI
npm install -g @shopify/cli @shopify/theme
```

## D1 – gdy bazy nie istnieją

```bash
cd workers/chat
wrangler d1 create jewelry-analytics-db
wrangler d1 create ai-assistant-sessions-db
```

Skopiuj `database_id` do wrangler.toml (chat, analytics, bigquery-batch).

## ID baz (już skonfigurowane)

- jewelry-analytics-db: `6a4f7cbb-3c1c-42c7-9d79-4ef74d421f23`
- ai-assistant-sessions-db: `475a1cb7-f1b5-47ba-94ed-40fd64c32451`

## Shopify – podłączenie pod apkę w dev

**Wymagane przed `shopify app deploy`.** Bez tego deploy się nie powiedzie.

```powershell
cd d:\aplikacja_epir
shopify app config link
```

1. **Aplikacja** – wybierz "Agent EPIR Art Jewellery" (lub utwórz nową). `client_id` w shopify.app.toml musi pasować do apki w Partners.
2. **Dev store** – wybierz development store (np. epir-art-silver-jewellery.myshopify.com).

Po linku projekt jest powiązany z apką – `shopify app deploy` wie, dokąd wgrywać extensions.

## Błędy i rozwiązywanie

| Błąd | Rozwiązanie |
|------|-------------|
| `wrangler: command not found` | `npm install -g wrangler` |
| `Authentication error` | `wrangler login` |
| `shopify: command not found` | `npm install -g @shopify/cli @shopify/theme` |
| `No app config found` | `shopify app config link` w katalogu z shopify.app.toml |
| `RAG_WORKER binding failed` | Deploy epir-rag-worker z epir_asystent przed chat |
| `D1 database not found` | Uruchom migracje, sprawdź database_id w wrangler.toml |
