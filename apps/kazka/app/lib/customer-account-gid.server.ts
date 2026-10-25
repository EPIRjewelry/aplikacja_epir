import type {createCustomerAccountClient} from '@shopify/hydrogen';
import type {HydrogenCloudflareSession} from '../../src/session';

type CustomerAccountClient = ReturnType<typeof createCustomerAccountClient>;

const CUSTOMER_ACCOUNT_SESSION_KEY = 'customerAccount';

function gidFromIdToken(idToken: string): string | null {
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1]!)) as {sub?: string};
    const sub = payload.sub?.trim();
    if (sub && sub.startsWith('gid://shopify/Customer/')) {
      return sub;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getLoggedInCustomerGid(
  customerAccount: CustomerAccountClient | null,
  session: HydrogenCloudflareSession,
): Promise<string | null> {
  if (!customerAccount) return null;
  if (!(await customerAccount.isLoggedIn())) return null;

  const record = session.get(CUSTOMER_ACCOUNT_SESSION_KEY) as
    | {idToken?: string}
    | undefined;
  const idToken = record?.idToken;
  if (!idToken) return null;
  return gidFromIdToken(idToken);
}
