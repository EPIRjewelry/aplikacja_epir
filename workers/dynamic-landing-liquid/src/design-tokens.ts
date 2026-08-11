/**
 * EPIR Design Tokens v1 — SSOT w kodzie.
 * Kanon roboczy: docs/kb/DESIGN_TOKENS.md
 */
export const EPIR_TOKENS = {
  bgPrimary: '#f1f1f1',
  bgSecondary: '#f5f5f5',
  bgAccent: '#2c684e',
  bgCream: '#f0ebe0',
  textPrimary: '#222222',
  textMuted: '#666666',
  onAccent: '#ffffff',
  accent: '#2c684e',
  accentHover: '#3c5629',
  field: '#f2f2f1',
  accentStoneDefault: '#2c684e',
  accentStoneGold: '#C9A227',
} as const;

export type HeroMode = 'light' | 'dark';

export type EditorialTheme = {
  heroMode: HeroMode;
  /** Border / ikony — override z metafieldu Accent Color kolekcji (przyszłość). */
  accentStone?: string;
};

export function resolveAccentStone(theme: EditorialTheme): string {
  return theme.accentStone?.trim() || EPIR_TOKENS.accentStoneDefault;
}
