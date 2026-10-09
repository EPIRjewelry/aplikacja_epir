/** Operator Studio / Project B — wykluczenie ze statystyk i eksportu Gemmy (klienci). */

export const OPERATOR_STUDIO_CHANNELS = ['operator', 'internal-dashboard'] as const;
export const OPERATOR_STUDIO_STOREFRONT_IDS = ['operator'] as const;

const ALIAS_RE = /^[a-z_][a-z0-9_]*$/i;

function sqlStringLiterals(values: readonly string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

/**
 * Predykat SQL: wiersz `messages` (alias) liczy się jako rozmowa klienta Gemmy.
 * Wyklucza Operator Studio po channel/storefront_id wiadomości oraz po sesji.
 */
export function gemmaCustomerMessagesSql(alias: string): string {
  if (!ALIAS_RE.test(alias)) {
    throw new Error(`gemmaCustomerMessagesSql: invalid alias "${alias}"`);
  }
  const channels = sqlStringLiterals(OPERATOR_STUDIO_CHANNELS);
  const storefronts = sqlStringLiterals(OPERATOR_STUDIO_STOREFRONT_IDS);
  const ch = `lower(trim(COALESCE(${alias}.channel,'')))`;
  const sf = `lower(trim(COALESCE(${alias}.storefront_id,'')))`;
  const sCh = `lower(trim(COALESCE(s_op.channel,'')))`;
  const sSf = `lower(trim(COALESCE(s_op.storefront_id,'')))`;
  return (
    `(` +
    `${ch} NOT IN (${channels})` +
    ` AND ${sf} NOT IN (${storefronts})` +
    ` AND NOT EXISTS (` +
    `SELECT 1 FROM sessions s_op` +
    ` WHERE s_op.session_id = ${alias}.session_id` +
    ` AND (${sCh} IN (${channels}) OR ${sSf} IN (${storefronts}))` +
    `)` +
    `)`
  );
}
