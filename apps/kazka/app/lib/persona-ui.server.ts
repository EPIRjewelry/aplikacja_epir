import type {PersonaUi} from '@epir/ui';
import {DEFAULT_PERSONA_UI} from '@epir/ui';

type MetaobjectField = {
  value?: string | null;
} | null;

type PersonaUiMetaobjectResponse = {
  metaobject?: {
    type?: string | null;
    assistantDisplayName?: MetaobjectField;
    chatTitle?: MetaobjectField;
    emptyStateHeadline?: MetaobjectField;
    emptyStateBody?: MetaobjectField;
  } | null;
};

const KAZKA_AI_PROFILE_GID = 'gid://shopify/Metaobject/2057969205580';
const STOREFRONT_API_VERSION = '2026-04';

const MISCONFIGURED_PERSONA_UI: PersonaUi = {
  displayName: 'Profil AI',
  chatTitle: 'Czat tymczasowo niedostępny',
  emptyState:
    'Nie udało się połączyć z konfiguracją czatu (sprawdź sekrety Pages i dostęp Storefront API).',
};

const PERSONA_UI_QUERY = `#graphql
  query KazkaPersonaUi($id: ID!) {
    metaobject(id: $id) {
      type
      assistantDisplayName: field(key: "assistant_display_name") {
        value
      }
      chatTitle: field(key: "chat_title") {
        value
      }
      emptyStateHeadline: field(key: "empty_state_headline") {
        value
      }
      emptyStateBody: field(key: "empty_state_body") {
        value
      }
    }
  }
`;

function normalizeText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildEmptyState(
  headline: string | undefined,
  body: string | undefined,
): string | undefined {
  const parts = [headline, body].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Pola z Shopify; brakujące klucze uzupełniane DEFAULT_PERSONA_UI (profil może mieć tylko pola RAG, bez UI). */
function mapPersonaUiFromMetaobject(
  data: PersonaUiMetaobjectResponse | null | undefined,
): PersonaUi {
  const metaobject = data?.metaobject;
  const displayName = normalizeText(metaobject?.assistantDisplayName?.value);
  const chatTitle = normalizeText(metaobject?.chatTitle?.value);
  const emptyState = buildEmptyState(
    normalizeText(metaobject?.emptyStateHeadline?.value),
    normalizeText(metaobject?.emptyStateBody?.value),
  );

  const partial: Partial<PersonaUi> = {
    ...(displayName ? {displayName} : {}),
    ...(chatTitle ? {chatTitle} : {}),
    ...(emptyState ? {emptyState} : {}),
  };

  const merged: PersonaUi = {...DEFAULT_PERSONA_UI, ...partial};
  if (!displayName || !chatTitle) {
    console.warn(
      '[kazka] ai_profile: brak assistant_display_name / chat_title w metaobject — uzupełniono z DEFAULT_PERSONA_UI; dodaj pola w Shopify Custom Data, aby nadpisać.',
    );
  }
  return merged;
}

export async function loadKazkaPersonaUi(env: Env): Promise<PersonaUi> {
  const shopDomain = normalizeText(env.PUBLIC_STORE_DOMAIN);
  const privateToken = normalizeText(env.PRIVATE_STOREFRONT_API_TOKEN);
  const publicToken = normalizeText(env.PUBLIC_STOREFRONT_API_TOKEN);
  const token = privateToken ?? publicToken;

  if (!shopDomain || !token) {
    console.error('[kazka] misconfigured AI profile credentials');
    return MISCONFIGURED_PERSONA_UI;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (privateToken) {
    headers['Shopify-Storefront-Private-Token'] = privateToken;
  } else {
    headers['X-Shopify-Storefront-Access-Token'] = token;
  }

  try {
    const response = await fetch(
      `https://${shopDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: PERSONA_UI_QUERY,
          variables: {id: KAZKA_AI_PROFILE_GID},
        }),
      },
    );

    if (!response.ok) {
      console.error('[kazka] failed to fetch AI profile metaobject', response.status);
      return MISCONFIGURED_PERSONA_UI;
    }

    const payload = (await response.json()) as {
      data?: PersonaUiMetaobjectResponse;
      errors?: unknown;
    };

    if (payload.errors) {
      console.error('[kazka] AI profile GraphQL errors', payload.errors);
      return MISCONFIGURED_PERSONA_UI;
    }

    if (payload.data?.metaobject == null) {
      console.error('[kazka] AI profile metaobject null (GID / publikacja / Storefront access?)');
      return MISCONFIGURED_PERSONA_UI;
    }

    return mapPersonaUiFromMetaobject(payload.data);
  } catch (error) {
    console.error('[kazka] failed to load storefront persona UI', error);
    return MISCONFIGURED_PERSONA_UI;
  }
}
