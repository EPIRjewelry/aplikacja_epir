import { describe, it, expect } from 'vitest';
import { detectPolicyInformationIntent } from '../src/intent/policy-information';

describe('detectPolicyInformationIntent', () => {
  it('wykrywa PL: regulamin zwrotów', () => {
    expect(detectPolicyInformationIntent('Jaki jest regulamin zwrotów?').match).toBe(true);
  });

  it('wykrywa PL: gwarancja', () => {
    expect(detectPolicyInformationIntent('Czy mają Państwo gwarancję na pierścionki?').match).toBe(true);
  });

  it('wykrywa PL: wysyłka z polskim znakiem', () => {
    expect(detectPolicyInformationIntent('Ile trwa wysyłka do Niemiec?').match).toBe(true);
  });

  it('wykrywa EN: return policy', () => {
    expect(detectPolicyInformationIntent('What is your return policy?').match).toBe(true);
  });

  it('wykrywa EN: warranty', () => {
    expect(detectPolicyInformationIntent('Do you offer warranty on rings?').match).toBe(true);
  });

  it('nie wykrywa neutralnej prośby o produkt', () => {
    expect(detectPolicyInformationIntent('Pokaż mi złote pierścionki z brylantem').match).toBe(false);
  });

  it('nie wykrywa pustego wejścia', () => {
    expect(detectPolicyInformationIntent('').match).toBe(false);
    expect(detectPolicyInformationIntent('   ').match).toBe(false);
  });

  it('jest odporny na niestringowe wejście', () => {
    expect(detectPolicyInformationIntent(undefined as unknown as string).match).toBe(false);
    expect(detectPolicyInformationIntent(null as unknown as string).match).toBe(false);
  });
});
