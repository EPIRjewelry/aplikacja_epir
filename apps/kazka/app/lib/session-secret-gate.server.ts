import {json} from '@remix-run/cloudflare';

export function missingSessionSecretResponse() {
  return json(
    {error: 'Customer account routes require SESSION_SECRET in this environment.'},
    {status: 503},
  );
}

export function missingCaaConfigResponse() {
  return json(
    {
      error:
        'Customer Account API is not configured (SESSION_SECRET, PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID, SHOP_ID).',
    },
    {status: 503},
  );
}
