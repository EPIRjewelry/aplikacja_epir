# Analiza raportu duplikacji w aplikacja_epir

Krótka ocena raportu porównującego duplikaty (server.ts, skrypty Shopify, tsconfig, wrangler).

---

## Zgadzam się z diagnozą

**Duplikacje są realne.** Raport poprawnie wskazuje:
- Identyczne skrypty `enable-storefront-access.mjs` i `add-cta-fields-section-hero.mjs` w kazka i zareczyny
- Praktycznie ten sam `server.ts` (różnice w walidacji env)
- Powielone tsconfig, postcss, wrangler vars

---

## Priorytety inaczej

| Krok z raportu | Moja ocena | Uzasadnienie |
|----------------|------------|--------------|
| **Skrypty CLI → packages/scripts** | Priorytet 1 | Prosty refactor, małe ryzyko. loadFromDevVars + GraphQL to wspólna logika. |
| **getStoreFrontClient → packages/utils** | Priorytet 2 | Średni wpływ. Trzeba pilnować typów i ESM. |
| **tsconfig base → extends** | Priorytet 3 | Niski zysk, ale łatwy do wdrożenia. |
| **wrangler.toml – generacja z szablonu** | Najniższy priorytet | Wysokie ryzyko: deploy, różne pliki per worker, specyfika bindings. Wątpliwy zysk vs. koszt. |

---

## Czego nie robiłbym (na razie)

**Generowanie wrangler.toml** – raport proponuje `generate-wrangler.js` łączący common + app-specific. To:
- Dodaje krok w CI/CD
- Wymaga zachowania spójności z config Cloudflare
- Workers mają różne sekcje (DO, services, cron) – merge jest nietrywialny

Lepsze podejście: zostawić osobne wrangler.toml, ewentualnie wydzielić wspólne wartości do pliku vars (np. JSON) i prostego skryptu, który je wstrzykuje – bez pełnej generacji TOML.

---

## Co zrobić najpierw

1. **packages/scripts** – wyciągnąć oba skrypty Shopify do jednego modułu z parametrami (shop, definitionId, tokenPath). Kazka i zareczyny wywołują:  
   `node packages/scripts/shopify-admin.mjs enable-storefront --shop=...`
2. **packages/utils/hydrogen.ts** – wspólny `getStoreFrontClient(context)` z poprawnymi typami Oxygen.
3. **tsconfig.base.json** – czysta refaktoryzacja, bez wpływu na runtime.

---

## Ryzyko

Zgadzam się z oceną: **medium**. Największe ryzyko daje zmiana `server.ts` i wrangler.toml. Skrypty i tsconfig są bezpieczniejsze.

---

## Podsumowanie

Raport jest wartościowy i trafnie identyfikuje duplikacje. Proponowana kolejność jest rozsądna, ale **generację wrangler.toml** odłożyłbym na później albo zastąpił prostszym podejściem. W pierwszej kolejności: skrypty, utils, tsconfig.
