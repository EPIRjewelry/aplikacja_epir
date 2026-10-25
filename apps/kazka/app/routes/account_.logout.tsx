import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';
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
  return redirect('/');
}

export async function action({context}: ActionFunctionArgs) {
  if (!context.env.SESSION_SECRET?.trim()) {
    return missingSessionSecretResponse();
  }
  if (!context.customerAccount) {
    return missingCaaConfigResponse();
  }
  return context.customerAccount.logout();
}
