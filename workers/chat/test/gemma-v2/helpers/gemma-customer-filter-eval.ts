import {
  OPERATOR_STUDIO_CHANNELS,
  OPERATOR_STUDIO_STOREFRONT_IDS,
} from '../../../../bigquery-batch/src/gemma-channel-filter';

export type SyntheticMessageRow = {
  session_id: string;
  channel: string;
  storefront_id: string;
};

export type SyntheticSessionRow = {
  session_id: string;
  channel: string;
  storefront_id: string;
};

/**
 * Semantyczny odpowiednik predykatu gemmaCustomerMessagesSql('m') dla pojedynczego wiersza
 * (bez EXISTS po innych wiadomościach). Używany w E0 bez uruchamiania SQL w Vitest.
 */
export function syntheticBuyerRowCountsAsGemmaCustomer(
  message: SyntheticMessageRow,
  sessionsById: Map<string, SyntheticSessionRow>,
): boolean {
  const norm = (v: string) => v.trim().toLowerCase();
  const opCh = new Set(OPERATOR_STUDIO_CHANNELS.map(norm));
  const opSf = new Set(OPERATOR_STUDIO_STOREFRONT_IDS.map(norm));

  const ch = norm(message.channel ?? '');
  const sf = norm(message.storefront_id ?? '');
  if (opCh.has(ch) || opSf.has(sf)) return false;

  const sess = sessionsById.get(message.session_id);
  if (sess) {
    const sCh = norm(sess.channel ?? '');
    const sSf = norm(sess.storefront_id ?? '');
    if (opCh.has(sCh) || opSf.has(sSf)) return false;
  }
  return true;
}
