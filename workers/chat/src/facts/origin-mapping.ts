/**
 * Mapowanie wartości opcji wariantu "jakość kamienia" na pochodzenie.
 * Źródło: inwentaryzacja opcji wariantów (do zatwierdzenia przez właściciela).
 *
 * Klucz: znormalizowana wartość opcji (lowercase, trimmed).
 * Wartość: origin z `GemstoneOrigin`.
 */
import type { GemstoneOrigin } from './types';

export const QUALITY_OPTION_TO_ORIGIN: ReadonlyMap<string, GemstoneOrigin> = new Map([
  // Natural diamond quality grades
  ['d/if', 'natural'],
  ['d/vvs1', 'natural'],
  ['d/vvs2', 'natural'],
  ['e/vs1', 'natural'],
  ['e/vs2', 'natural'],
  ['f/vs1', 'natural'],
  ['f/vs2', 'natural'],
  ['g/vs1', 'natural'],
  ['g/vs2', 'natural'],
  ['g/si1', 'natural'],
  ['h/si1', 'natural'],
  ['h/si2', 'natural'],
  ['naturalny', 'natural'],
  ['natural', 'natural'],
  ['kamień naturalny', 'natural'],
  // Lab-grown
  ['lab', 'lab_grown'],
  ['lab grown', 'lab_grown'],
  ['lab-grown', 'lab_grown'],
  ['laboratoryjny', 'lab_grown'],
  ['hodowlany', 'lab_grown'],
  // Cultured (pearls etc.)
  ['hodowlana', 'cultured'],
  ['cultured', 'cultured'],
  ['perła hodowlana', 'cultured'],
]);

/**
 * Mapowanie wartości metapola `custom.gemstone_origin` produktu.
 */
export const PRODUCT_METAFIELD_ORIGIN: ReadonlyMap<string, GemstoneOrigin> = new Map([
  ['naturalny', 'natural'],
  ['natural', 'natural'],
  ['laboratoryjny', 'lab_grown'],
  ['lab_grown', 'lab_grown'],
  ['hodowlana', 'cultured'],
  ['cultured', 'cultured'],
  ['do wyboru', 'unknown'],
  ['mieszane', 'mixed'],
]);
