---
name: epir-deployment
description: Wykonuje instalację i deployment aplikacji EPIR (Cloudflare Workers, D1, Shopify, Hydrogen). Obejmuje shopify app build, shopify app deploy, extensions, App Proxy. Używać gdy użytkownik prosi o deploy, wdrożenie, instalację EPIR, deploy Shopify lub gdy trzeba uruchomić deploy.ps1, migracje D1, sekrety, RAG worker, Hydrogen Pages.
---

# EPIR Deployment Specialist

Specjalista od wdrożenia aplikacji EPIR. Zna pełną procedurę instalacji i deploymentu. **Wykonuje kroki**, nie tylko opisuje.

## Wymagania (przed deployem)

| Narzędzie                 | Weryfikacja               | Instalacja                               |
| ------------------------- | ------------------------- | ---------------------------------------- |
| Node.js 18+               | `node -v`                 | https://nodejs.org                       |
| npm                       | `npm -v`                  | Z Node.js                                |
| Wrangler                  | `wrangler --version`      | `npm install -g wrangler`                |
| Shopify CLI               | `shopify version`         | `npm install -g @shopify/cli@latest`     |
| Cloudflare login          | `wrangler whoami`         | `wrangler login`                         |
| Shopify (app + dev store) | `shopify app config link` | Powiązanie z apką w Partners i dev store |

## Kolejność deploymentu (wykonuj w tej kolejności)

### Faza 0: Jednorazowa konfiguracja (jeśli pierwszy deploy)

```powershell
# 0. Shopify – podłączenie pod apkę w dev (PRZED shopify app deploy)
cd d:\aplikacja_epir
shopify app config link   # Wybierz apkę w Partners + dev store

# 1. Migracje D1 (jeśli bazy już istnieją)
cd d:\aplikacja_epir\workers\chat
wrangler d1 migrations apply ai-assistant-sessions-db --remote

cd d:\aplikacja_epir\workers\bigquery-batch
wrangler d1 migrations apply jewelry-analytics-db --remote

# 2. Sekrety (wymagane przed deploy workers)
cd d:\aplikacja_epir\workers\chat
wrangler secret put GROQ_API_KEY
wrangler secret put SHOPIFY_APP_SECRET

cd d:\aplikacja_epir\workers\bigquery-batch
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put GOOGLE_PROJECT_ID

# 3. RAG worker (w aplikacja_epir – deploy.ps1 go deployuje przed chat; ręcznie tylko gdy chcesz zaktualizować sam RAG)
cd d:\aplikacja_epir\workers\rag-worker
wrangler deploy
```

### Faza 1: Główny deploy (deploy.ps1)

```powershell
cd d:\aplikacja_epir
.\deploy.ps1
```

Skrypt wykonuje: npm install → **RAG** → analytics → bigquery-batch → chat → **shopify app build** → **shopify app deploy**.

### Shopify – podłączenie pod apkę w dev (OBOWIĄZKOWE przed deployem)

**Musisz się podłączyć pod apkę w Shopify Partners i dev store.** Bez tego `shopify app deploy` nie zadziała.

```powershell
cd d:\aplikacja_epir
shopify app config link
```

CLI zapyta o:

1. **Aplikację** – wybierz istniejącą (np. "epir_ai") lub utwórz nową. `client_id` w `shopify.app.toml` musi się zgadzać z apką w Partners.
2. **Dev store** – wybierz development store (np. `epir-art-silver-jewellery.myshopify.com` lub inny dev store).

Po linku: `shopify app deploy` będzie wiedział, dokąd wgrywać extensions.

### Shopify (w ramach Fazy 1)

`deploy.ps1` obejmuje pełny deploy aplikacji Shopify:

- **shopify app build** – buduje extensions (asystent-klienta, my-web-pixel)
- **shopify app deploy --allow-updates** – wgrywa extensions i konfigurację (App Proxy, webhooks) do Shopify Partners

**Co trafia na Shopify:** extensions (Theme App Extension + Web Pixel), App Proxy (`/apps/assistant/*` → chat worker), konfiguracja auth.

### Faza 2: Hydrogen (Cloudflare Pages)

```powershell
cd d:\aplikacja_epir\apps\kazka
npm run build
wrangler pages deploy public --project-name=kazka-hydrogen-pages

cd d:\aplikacja_epir\apps\zareczyny
npm run build
wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
```

**Sekrety w Cloudflare Pages** (Dashboard → Pages → Settings → Variables): SESSION_SECRET, PUBLIC_STOREFRONT_API_TOKEN, PRIVATE_STOREFRONT_API_TOKEN, PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID.

## Weryfikacja po deployu

- [ ] https://asystent.epirbizuteria.pl/chat – odpowiada
- [ ] https://asystent.epirbizuteria.pl/pixel – POST zwraca ok
- [ ] **Shopify:** Partners Dashboard → App → Extensions – asystent-klienta, my-web-pixel widoczne
- [ ] **Shopify:** App Proxy skonfigurowany (`/apps/assistant/*` → asystent.epirbizuteria.pl)

## Ścieżki projektu

| Element        | Ścieżka                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| Główny projekt | `d:\aplikacja_epir`                                                          |
| RAG worker     | `d:\aplikacja_epir\workers\rag-worker`                                       |
| Dokumentacja   | `docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`, `docs/EPIR_INGRESS_AND_RUNTIME.md` |

## Zachowanie agenta

1. **Wykonuj** – uruchamiaj komendy (deploy.ps1, wrangler, shopify), nie tylko opisz.
2. **Sprawdzaj** – przed deployem: `wrangler whoami`, `shopify auth status` (jeśli potrzeba).
3. **Raportuj** – po każdym kroku: sukces/błąd, ewentualne błędy z outputu.
4. **Nie pomijaj** – RAG worker musi być zdeployowany przed chat workerem.
