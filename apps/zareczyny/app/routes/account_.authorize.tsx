import {type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {
  missingCaaConfigResponse,
  missingSessionSecretResponse,
} from '~/lib/session-secret-gate.server';

export async function loader({context}: LoaderFunctionArgs) {
  if (!context.env.SESSION_SECRET?.trim()) {
    return missingSessionSecretResponse();
  }
  if (!context.customerAccount) {
    return missingCaaConfigResponse();
  }
  return context.customerAccount.authorize();
}
