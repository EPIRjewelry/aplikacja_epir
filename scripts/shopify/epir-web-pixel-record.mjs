/**
 * App web pixel record for extensions/my-web-pixel.
 * Shopify's webPixel query returns a GraphQL error when this app has no pixel yet:
 * "No web pixel was found for this app." That is an empty record, not a failed token.
 * An existing pixel is updated in place. This does not touch a Customer Events paste.
 */

export const EPIR_WEB_PIXEL_SETTINGS = {
  accountID: 'epir',
  pixelEndpoint: 'https://asystent.epirbizuteria.pl',
};

export const WEB_PIXEL_QUERY = `query EpirWebPixel {
  webPixel {
    id
    settings
  }
}`;

export const WEB_PIXEL_CREATE = `mutation EpirWebPixelCreate($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) {
    userErrors { field message code }
    webPixel { id settings }
  }
}`;

export const WEB_PIXEL_UPDATE = `mutation EpirWebPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
  webPixelUpdate(id: $id, webPixel: $webPixel) {
    userErrors { field message code }
    webPixel { id settings }
  }
}`;

export function isMissingWebPixelError(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every((err) =>
    String(err?.message ?? '')
      .toLowerCase()
      .includes('no web pixel was found'),
  );
}

export function settingsMatch(raw, settings = EPIR_WEB_PIXEL_SETTINGS) {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed.accountID === settings.accountID && parsed.pixelEndpoint === settings.pixelEndpoint;
  } catch {
    return false;
  }
}

function errorText(errors) {
  return (Array.isArray(errors) ? errors : [])
    .map((err) => {
      const field = Array.isArray(err?.field) ? err.field.join('.') : err?.field || '';
      return [err?.code, field, err?.message].filter(Boolean).join(' ').trim();
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * @param {(query: string, variables?: Record<string, unknown>) => Promise<{ data?: any, errors?: Array<{ message?: string }> }>} graphql
 * @param {{ accountID: string, pixelEndpoint: string }} [settings]
 */
export async function reconcileEpirWebPixel(graphql, settings = EPIR_WEB_PIXEL_SETTINGS) {
  const current = await graphql(WEB_PIXEL_QUERY);
  const errors = current?.errors;
  const missing = isMissingWebPixelError(errors);
  if (Array.isArray(errors) && errors.length > 0 && !missing) {
    return {ok: false, error: errorText(errors) || 'graphql error'};
  }

  const existing = missing ? null : (current?.data?.webPixel ?? null);
  const input = {webPixel: {settings: JSON.stringify(settings)}};

  if (!existing?.id) {
    const created = await graphql(WEB_PIXEL_CREATE, input);
    const payload = created?.data?.webPixelCreate;
    const userErrors = payload?.userErrors ?? [];
    if (userErrors.length) return {ok: false, error: errorText(userErrors) || 'webPixelCreate failed'};
    if (Array.isArray(created?.errors) && created.errors.length > 0) {
      return {ok: false, error: errorText(created.errors) || 'webPixelCreate failed'};
    }
    return {ok: true, action: 'created', id: payload?.webPixel?.id};
  }

  if (settingsMatch(existing.settings, settings)) {
    return {ok: true, action: 'already_active', id: existing.id};
  }

  const updated = await graphql(WEB_PIXEL_UPDATE, {id: existing.id, ...input});
  const payload = updated?.data?.webPixelUpdate;
  const userErrors = payload?.userErrors ?? [];
  if (userErrors.length) return {ok: false, error: errorText(userErrors) || 'webPixelUpdate failed'};
  if (Array.isArray(updated?.errors) && updated.errors.length > 0) {
    return {ok: false, error: errorText(updated.errors) || 'webPixelUpdate failed'};
  }
  return {ok: true, action: 'updated', id: payload?.webPixel?.id || existing.id};
}
