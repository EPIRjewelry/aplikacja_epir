import {resolveUrlForChannel} from '../buyer/channel-origins';
import type {BuyerChannelId} from '../buyer/channel-switch';

/** Ścieżka strony kontaktu sklepu (Liquid / Hydrogen — ten sam slug w repo). */
const STORE_CONTACT_PAGE_PATH = '/pages/kontakt';

export function gemmaV2EmergencyReply(channelId: BuyerChannelId): string {
  const contactUrl =
    resolveUrlForChannel(STORE_CONTACT_PAGE_PATH, channelId) ??
    resolveUrlForChannel(STORE_CONTACT_PAGE_PATH, 'epir-online-store');
  const link = contactUrl ?? STORE_CONTACT_PAGE_PATH;
  return (
    'Przepraszamy, asystent jest chwilowo niedostępny. ' +
    'Prosimy o kontakt przez stronę kontaktu: ' +
    link +
    '.'
  );
}
