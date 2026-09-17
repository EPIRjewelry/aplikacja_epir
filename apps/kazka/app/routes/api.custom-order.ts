/**
 * BFF: przeglądarka → POST /api/custom-order (same origin) → S2S POST na worker `/cocreate`.
 * Wymaga `EPIR_CHAT_SHARED_SECRET` w Cloudflare Pages (jak api.chat / api.consent).
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@remix-run/cloudflare';
import {getEpirChatSharedSecret} from '~/lib/chat-proxy-secret';
import {KAZKA_CHANNEL, KAZKA_STOREFRONT_ID} from '~/lib/chat-widget-context';

const COCREATE_S2S_URL = 'https://asystent.epirbizuteria.pl/cocreate';
const MISSING_SECRET_ERROR =
  'Custom order proxy: brak EPIR_CHAT_SHARED_SECRET w Cloudflare Pages (Production env).';

function getEnvFromActionContext(
  context: ActionFunctionArgs['context'],
): Record<string, unknown> {
  const raw = context as unknown as Record<string, unknown> | undefined;
  const envDirect = raw?.env;
  if (envDirect && typeof envDirect === 'object') {
    return envDirect as Record<string, unknown>;
  }
  const cloudflare = raw?.cloudflare as Record<string, unknown> | undefined;
  const envNested = cloudflare?.env;
  if (envNested && typeof envNested === 'object') {
    return envNested as Record<string, unknown>;
  }
  return {};
}

export async function loader(_args: LoaderFunctionArgs) {
  return json({error: 'Method not allowed'}, {status: 405});
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const env = getEnvFromActionContext(context);
  const secret = getEpirChatSharedSecret(env);
  if (!secret) {
    return json(
      {
        ok: false,
        error: MISSING_SECRET_ERROR,
        hint:
          'Ustaw sekret EPIR_CHAT_SHARED_SECRET w Cloudflare Pages -> kazka-hydrogen-pages -> Variables and Secrets.',
      },
      {status: 503},
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ok: false, error: 'Nieprawidłowe dane formularza.'}, {status: 400});
  }

  if (!formData.get('source_url')) {
    formData.set('source_url', request.headers.get('Referer') ?? '');
  }

  let upstream: Response;
  try {
    upstream = await fetch(COCREATE_S2S_URL, {
      method: 'POST',
      headers: {
        'X-EPIR-SHARED-SECRET': secret,
        'X-EPIR-STOREFRONT-ID': KAZKA_STOREFRONT_ID,
        'X-EPIR-CHANNEL': KAZKA_CHANNEL,
      },
      body: formData,
    });
  } catch (err) {
    console.error('[api.custom-order] Upstream fetch failed', err);
    return json(
      {
        ok: false,
        error:
          'Nie udało się połączyć z serwerem briefu. Spróbuj ponownie za chwilę.',
      },
      {status: 502},
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await upstream.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!upstream.ok || !data.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : upstream.status === 401
          ? 'Błąd autoryzacji formularza. Odśwież stronę i spróbuj ponownie.'
          : upstream.status === 404
            ? 'Usługa briefu jest chwilowo niedostępna.'
            : upstream.status === 429
              ? 'Zbyt wiele prób — poczekaj chwilę i spróbuj ponownie.'
              : 'Nie udało się wysłać briefu. Spróbuj ponownie.';
    return json({ok: false, error: message}, {status: upstream.status});
  }

  return json({
    ok: true,
    referenceId:
      typeof data.referenceId === 'string' ? data.referenceId : undefined,
    message:
      typeof data.message === 'string'
        ? data.message
        : 'Brief został przyjęty. Odezwiemy się w ciągu 2–3 dni roboczych.',
  });
}
