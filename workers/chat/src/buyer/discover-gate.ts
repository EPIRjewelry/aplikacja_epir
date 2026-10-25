import {
  allowSearchCatalogThisTurn,
  pickDiscoverMissingSlot,
  shouldDeferPoliciesForEngagementAdvisory,
} from './discover-policy';
import {discoverQuestionForSlot} from './discover-templates';
import {extractDiscoverSlots, type BuyerDiscoverSlots} from './discover-slots';

export type DiscoverGateDecision = {
  blockSearchCatalog: boolean;
  blockShopPolicies: boolean;
  missingSlot: keyof BuyerDiscoverSlots;
  slots: BuyerDiscoverSlots;
  discoverAssistantTurns: number;
};

export function countPreCatalogDiscoverTurns(
  history: Array<{role: string; content: string}>,
): number {
  let n = 0;
  for (const row of history) {
    if (row.role !== 'assistant') continue;
    if (/\/products\//i.test(row.content)) break;
    n += 1;
  }
  return n;
}

export function sessionAlreadyShowedCatalog(
  history: Array<{role: string; content: string}>,
): boolean {
  return history.some((h) => h.role === 'assistant' && /\/products\//i.test(h.content));
}

export function evaluateDiscoverGate(params: {
  userText: string;
  history: Array<{role: string; content: string}>;
}): DiscoverGateDecision {
  const userLines = [
    ...params.history.filter((h) => h.role === 'user').map((h) => h.content),
    params.userText,
  ];
  const slots = extractDiscoverSlots(userLines);
  const discoverAssistantTurns = countPreCatalogDiscoverTurns(params.history);
  const catalogAlreadyShown = sessionAlreadyShowedCatalog(params.history);

  const allowCatalog = allowSearchCatalogThisTurn({
    slots,
    userText: params.userText,
    allUserTexts: userLines,
    discoverAssistantTurns,
    catalogAlreadyShown,
  });

  const blockShopPolicies = shouldDeferPoliciesForEngagementAdvisory(slots, params.userText);

  return {
    blockSearchCatalog: !allowCatalog,
    blockShopPolicies,
    missingSlot: pickDiscoverMissingSlot(slots),
    slots,
    discoverAssistantTurns,
  };
}

export function discoverContextBlock(decision: DiscoverGateDecision): string {
  const lines: string[] = ['[DISCOVER — polityka tury]'];
  if (decision.blockSearchCatalog) {
    lines.push(
      'Nie wywołuj search_catalog w tej turze. Zadaj jedno krótkie pytanie doprecyzowujące (maks. 2 zdania, możesz podać 2–3 opcje).',
    );
    lines.push(`Sugerowane pytanie: ${discoverQuestionForSlot(decision.missingSlot)}`);
  }
  if (decision.blockShopPolicies) {
    lines.push(
      'Klient pyta o pierścionek zaręczynowy z brakiem rozmiaru lub terminu — najpierw dopytaj o rozmiar, termin lub budżet; nie zastępuj tego jednym wywołaniem search_shop_policies_and_faqs.',
    );
  }
  return lines.join('\n');
}
