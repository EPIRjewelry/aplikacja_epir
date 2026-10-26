/**
 * BFF: przeglądarka → POST /api/custom-order (same origin) → S2S POST na worker `/cocreate`.
 * EMERGENCY: brief Kazka wyłączony (flood e-mail) — bez upstream do czasu Turnstile.
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';

export async function loader(_args: LoaderFunctionArgs) {
  return json({error: 'Method not allowed'}, {status: 405});
}

export async function action({request}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  return json(
    {
      ok: false,
      error:
        'Formularz briefu jest chwilowo niedostępny. Napisz na epir@epirbizuteria.pl.',
    },
    {status: 503},
  );
}
