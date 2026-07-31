import { describe, it, expect } from 'vitest';
import { detectSizeTableIntent } from '../src/intent/size-table';

describe('detectSizeTableIntent', () => {
  it('wykrywa krótkie „Rozmiar 17”', () => {
    expect(detectSizeTableIntent('Rozmiar 17').match).toBe(true);
    expect(detectSizeTableIntent('rozmiar 16.5').match).toBe(true);
  });

  it('wykrywa pytanie o tabelę / pomiar', () => {
    expect(detectSizeTableIntent('Jaka jest tabela rozmiarów?').match).toBe(true);
    expect(detectSizeTableIntent('Jak zmierzyć palec?').match).toBe(true);
  });

  it('wykrywa EN ring size', () => {
    expect(detectSizeTableIntent('What is my ring size chart?').match).toBe(true);
  });

  it('nie wykrywa zwykłego pytania o produkt', () => {
    expect(detectSizeTableIntent('Pokaż pierścionki z szafirem').match).toBe(false);
  });

  it('jest odporny na niestringowe wejście', () => {
    expect(detectSizeTableIntent(undefined as unknown as string).match).toBe(false);
  });
});
