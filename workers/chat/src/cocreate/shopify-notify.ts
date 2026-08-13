import type { Env } from '../config/bindings';
import { callAdminAPI } from '../graphql';
import type { CocreatePersistedBrief } from './types';

function shopDomain(env: Env): string {
  return (env.SHOP_DOMAIN || 'epir-art-silver-jewellery.myshopify.com').trim();
}

function buildNote(row: CocreatePersistedBrief): string {
  const brief = JSON.parse(row.briefJson) as Record<string, string | boolean | null>;
  const lines = [
    `[Brief współtworzenia ${row.referenceId}]`,
    `Wizja: ${row.vision}`,
    brief.jewelryType ? `Typ: ${brief.jewelryType}` : null,
    brief.metal ? `Metal: ${brief.metal}` : null,
    brief.budgetBand ? `Budżet: ${brief.budgetBand}` : null,
    brief.timeline ? `Termin: ${brief.timeline}` : null,
    row.phone ? `Tel: ${row.phone}` : null,
    row.r2Key ? `Załącznik: ${row.r2Key}` : null,
    row.sourceUrl ? `Źródło: ${row.sourceUrl}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export async function notifyCocreateViaShopifyAdmin(
  env: Env,
  row: CocreatePersistedBrief,
): Promise<boolean> {
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!token) {
    return false;
  }

  const note = buildNote(row);
  const tags = ['lead:cocreate', row.referenceId];

  try {
    const createResult = await callAdminAPI<{
      customerCreate?: { customer?: { id: string }; userErrors?: Array<{ message: string }> };
    }>(shopDomain(env), token, `
      mutation CocreateCustomerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }
    `, {
      input: {
        email: row.email,
        firstName: row.name,
        phone: row.phone || undefined,
        note,
        tags,
        ...(row.consentMarketing
          ? {
              emailMarketingConsent: {
                marketingState: 'SUBSCRIBED',
                marketingOptInLevel: 'SINGLE_OPT_IN',
              },
            }
          : {}),
      },
    });

    const createErrors = createResult.customerCreate?.userErrors ?? [];
    const duplicate = createErrors.some((e) => /already been taken|already exists/i.test(e.message));
    if (!duplicate && createErrors.length > 0) {
      console.warn('[cocreate] shopify notify create errors', {
        referenceId: row.referenceId,
        errors: createErrors.map((e) => e.message),
      });
      return false;
    }

    if (duplicate) {
      const search = await callAdminAPI<{
        customers?: { edges?: Array<{ node?: { id: string; note?: string | null } }> };
      }>(shopDomain(env), token, `
        query CocreateCustomerByEmail($query: String!) {
          customers(first: 1, query: $query) {
            edges { node { id note } }
          }
        }
      `, { query: `email:${row.email}` });

      const customerId = search.customers?.edges?.[0]?.node?.id;
      if (!customerId) {
        return false;
      }

      const priorNote = search.customers?.edges?.[0]?.node?.note?.trim();
      const updateResult = await callAdminAPI<{
        customerUpdate?: { customer?: { id: string }; userErrors?: Array<{ message: string }> };
      }>(shopDomain(env), token, `
        mutation CocreateCustomerUpdate($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer { id }
            userErrors { field message }
          }
        }
      `, {
        input: {
          id: customerId,
          note: priorNote ? `${priorNote}\n\n${note}` : note,
          tags,
        },
      });

      const updateErrors = updateResult.customerUpdate?.userErrors ?? [];
      if (updateErrors.length > 0) {
        console.warn('[cocreate] shopify notify update errors', {
          referenceId: row.referenceId,
          errors: updateErrors.map((e) => e.message),
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[cocreate] shopify notify failed', error);
    return false;
  }
}
