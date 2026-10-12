/**
 * Origin / host sklepu per kanał buyer — resolve relative KB URL i strażnik host-kanał.
 */
import type { BuyerChannelId } from './channel-switch';

export const EPIR_CUSTOM_ORDER_FORM_URL =
  'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model';

const ORIGIN_BY_CHANNEL: Record<BuyerChannelId, string> = {
  'epir-online-store': 'https://epirbizuteria.pl',
  'kazka-hydrogen': 'https://kazka.epirbizuteria.pl',
  'epir-zareczyny': 'https://zareczyny.epirbizuteria.pl',
};

const LINK_HOSTS_BY_CHANNEL: Record<BuyerChannelId, string[]> = {
  'epir-online-store': ['epirbizuteria.pl', 'www.epirbizuteria.pl', 'l.epirbizuteria.pl'],
  'kazka-hydrogen': ['kazka.epirbizuteria.pl'],
  'epir-zareczyny': [
    'zareczyny.epirbizuteria.pl',
    'epirbizuteria.pl',
    'www.epirbizuteria.pl',
  ],
};

export function storefrontOriginForChannel(channelId: BuyerChannelId): string {
  return ORIGIN_BY_CHANNEL[channelId] ?? ORIGIN_BY_CHANNEL['epir-online-store'];
}

export function linkHostsForChannel(channelId: BuyerChannelId): string[] {
  return LINK_HOSTS_BY_CHANNEL[channelId] ?? LINK_HOSTS_BY_CHANNEL['epir-online-store'];
}

export function hostAllowedForChannel(hostname: string, channelId: BuyerChannelId): boolean {
  const h = hostname.trim().toLowerCase();
  return linkHostsForChannel(channelId).some((allowed) => allowed.toLowerCase() === h);
}

/** Absolute https URL albo resolve path względem origin kanału. */
export function resolveUrlForChannel(
  raw: string,
  channelId: BuyerChannelId,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const u = new URL(trimmed);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      return u.toString();
    }
    if (trimmed.startsWith('/')) {
      return new URL(trimmed, storefrontOriginForChannel(channelId)).toString();
    }
  } catch {
    return null;
  }
  return null;
}

/** Formularz zamówienia indywidualnego: EPIR + GZ hardcode; Kazka z profilu. */
export function defaultCustomOrderUrlForChannel(channelId: BuyerChannelId): string | null {
  if (channelId === 'epir-online-store' || channelId === 'epir-zareczyny') {
    return EPIR_CUSTOM_ORDER_FORM_URL;
  }
  return null;
}

export function validateCustomOrderUrl(
  raw: string,
  channelId: BuyerChannelId,
): string | null {
  const resolved = resolveUrlForChannel(raw, channelId);
  if (!resolved) return null;
  try {
    const u = new URL(resolved);
    if (u.protocol !== 'https:') return null;
    if (!hostAllowedForChannel(u.hostname, channelId)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
