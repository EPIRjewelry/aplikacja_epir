import {detectPolicyInformationIntent} from '../intent/policy-information';

/** Szerokie słowa kluczowe KB (bez faktów) — ostatnia próba MCP przed fail-closed. */
export const CONTACT_KB_BROAD_QUERY =
  'kontakt telefon e-mail adres pracownia wizyta przymiarka godziny otwarcia dojazd';

export function shouldTryBroadContactKbQuery(userText: string): boolean {
  return detectPolicyInformationIntent(userText).match;
}

export function contactKbRetryQueries(
  userText: string,
  primaryQuery: string,
  policyQuery: string,
): string[] {
  const trimmedUser = userText.trim();
  const retries: string[] = [];
  if (
    trimmedUser &&
    policyQuery &&
    policyQuery !== trimmedUser &&
    primaryQuery !== trimmedUser
  ) {
    retries.push(trimmedUser);
  }
  if (shouldTryBroadContactKbQuery(trimmedUser)) {
    const broad = CONTACT_KB_BROAD_QUERY;
    if (primaryQuery !== broad && !retries.includes(broad)) {
      retries.push(broad);
    }
  }
  return retries;
}
