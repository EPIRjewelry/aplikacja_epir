import {describe, expect, it} from 'vitest';
import {
  allowSearchCatalogThisTurn,
  isNonCommitmentUserText,
} from '../src/buyer/discover-policy';
import {extractDiscoverSlots} from '../src/buyer/discover-slots';
import {evaluateDiscoverGate} from '../src/buyer/discover-gate';

describe('buyer discover policy', () => {
  it('prezent bez profilu — blokuje katalog w turze 0', () => {
    const slots = extractDiscoverSlots(['coś na prezent', 'no nie wiem']);
    expect(
      allowSearchCatalogThisTurn({
        slots,
        userText: 'no nie wiem',
        discoverAssistantTurns: 0,
        catalogAlreadyShown: false,
      }),
    ).toBe(false);
  });

  it('nie wiem — nie zezwala na katalog', () => {
    expect(isNonCommitmentUserText('no nie wiem')).toBe(true);
  });

  it('naszyjnik srebrny — od razu katalog (S-B)', () => {
    const slots = extractDiscoverSlots(['naszyjnik srebrny']);
    expect(
      allowSearchCatalogThisTurn({
        slots,
        userText: 'naszyjnik srebrny',
        discoverAssistantTurns: 0,
        catalogAlreadyShown: false,
      }),
    ).toBe(true);
  });

  it('S-E: zaręczyny bez rozmiaru — twardy gate katalogu i KB', () => {
    const d = evaluateDiscoverGate({
      userText: 'pierścionek zaręczynowy, rozmiar nie znam, termin za miesiąc',
      history: [],
    });
    expect(d.blockShopPolicies).toBe(true);
    expect(d.blockSearchCatalog).toBe(true);
  });

  it('zaręczyny — pokaż cokolwiek zdejmuje blokadę katalogu', () => {
    const d = evaluateDiscoverGate({
      userText: 'pierścionek zaręczynowy, rozmiar nie znam, pokaż cokolwiek',
      history: [],
    });
    expect(d.blockSearchCatalog).toBe(false);
  });

  it('po 2 turach discover i 2 slotach — zezwala na katalog przy prezencie', () => {
    const slots = extractDiscoverSlots([
      'prezent dla żony',
      'naszyjnik',
      'do 2000',
    ]);
    expect(
      allowSearchCatalogThisTurn({
        slots,
        userText: 'do 2000',
        discoverAssistantTurns: 2,
        catalogAlreadyShown: false,
      }),
    ).toBe(true);
  });
});
