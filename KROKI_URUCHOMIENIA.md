# Kroki uruchomienia aplikacji EPIR

> [!IMPORTANT]
> To jest **dokument operacyjny / pomocniczy**.
> Najpierw przeczytaj dokumenty nadrzędne:
>
> - `EPIR_AI_ECOSYSTEM_MASTER.md`
> - `EPIR_AI_BIBLE.md`
>
> Ten plik opisuje **kolejność uruchomienia i deployu**, a nie nadrzędną architekturę ani orthodoksję.

Uruchom w terminalu (PowerShell) – **pojedynczo, w podanej kolejności**.  
Przed startem: `wrangler login` lub `$env:CLOUDFLARE_API_TOKEN = "..."`

---

## 1. Migracje D1

```powershell
cd D:\aplikacja_epir\workers\chat
wrangler d1 migrations apply ai-assistant-sessions-db --remote

cd D:\aplikacja_epir\workers\bigquery-batch
wrangler d1 migrations apply jewelry-analytics-db --remote
```

---

## 2. Sekrety chat workera

```powershell
cd D:\aplikacja_epir\workers\chat
wrangler secret put GROQ_API_KEY
wrangler secret put SHOPIFY_APP_SECRET
wrangler secret put ADMIN_KEY
```

_(Wrangler poprosi o wartość dla każdego – wklej z klipboarda.)_

---

## 3. Sekrety bigquery-batch (opcjonalnie – jeśli eksport do BigQuery)

```powershell
cd D:\aplikacja_epir\workers\bigquery-batch
wrangler secret put GOOGLE_CLIENT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put GOOGLE_PROJECT_ID
```

---

## 4. RAG worker (opcjonalnie – deploy.ps1 w kroku 6 obejmuje RAG)

RAG jest w `aplikacja_epir`. Deploy ręczny tylko gdy chcesz zaktualizować sam RAG:

```powershell
cd D:\aplikacja_epir\workers\rag-worker
wrangler deploy
```

---

## 5. Podpięcie Shopify (jednorazowo, interaktywne)

```powershell
cd D:\aplikacja_epir
shopify app config link
```

Wybierz apkę w Partners oraz dev store.

---

## 6. Główny deploy

```powershell
cd D:\aplikacja_epir
.\deploy.ps1
```

_(npm install → RAG → analytics → bigquery-batch → chat → shopify app build → shopify app deploy)_

---

## 7. Hydrogen Pages

```powershell
cd D:\aplikacja_epir\apps\kazka
npm run build
wrangler pages deploy public --project-name=kazka-hydrogen-pages

cd D:\aplikacja_epir\apps\zareczyny
npm run build
wrangler pages deploy public --project-name=zareczyny-hydrogen-pages
```

**Sekrety w Cloudflare Pages** (Settings → Variables):  
`SESSION_SECRET`, `PUBLIC_STOREFRONT_API_TOKEN`, `PRIVATE_STOREFRONT_API_TOKEN`, `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`

---

## 8. Weryfikacja

- [ ] https://asystent.epirbizuteria.pl/chat
- [ ] https://asystent.epirbizuteria.pl/admin/dashboard?key=&lt;ADMIN_KEY&gt;
- [ ] Shopify: extensions widoczne, App Proxy skonfigurowany
