/**
 * Wersje Shopify API używane przez worker czatu (`epir-art-jewellery-worker`).
 *
 * ## Admin GraphQL
 * **Musi** być zsynchronizowane z `api_version` w sekcji `[webhooks]` pliku
 * [`shopify.app.toml`](../../../../shopify.app.toml) (jedna aplikacja `epir_ai`).
 * Statyczna walidacja w CI: `python3 scripts/ci/validate-shopify-admin-api-version.py`
 * (job „Deploy safety policy” / `deploy-policy.yml`).
 *
 * Procedura podbicia wersji Admin: sekcja **„Wersje Shopify API w kodzie workera czatu”** w
 * [`docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md`](../../../../docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md)
 * (`### workers/chat`) — zmień **oba** miejsca w jednym PR i odpal skrypt walidacji.
 *
 * ## Storefront GraphQL
 * **Nie** podbijamy automatycznie razem z Admin API: Storefront ma osobny cykl zgodności
 * z tokenami Storefront / Hydrogen (`apps/kazka`, `apps/zareczyny`). Zmiana wersji Storefront
 * wymaga retestu metaobjectów, tabeli rozmiarów i AI profile.
 */
export const SHOPIFY_ADMIN_API_VERSION = '2026-04';

export const SHOPIFY_STOREFRONT_API_VERSION = '2024-10';
