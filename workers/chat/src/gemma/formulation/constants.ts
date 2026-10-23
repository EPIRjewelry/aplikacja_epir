/** Wspólny budżet czasu na oba wywołania B (pierwsze + retry walidatora). */
export const GEMMA_FORMULATION_BUDGET_MS = 5000;

/** Placeholdery w tekście B — stitch wstawia URL i ceny z TurnFacts. */
export const GEMMA_PLACEHOLDER_REF = /\{\{(g\d+)\}\}/g;
export const GEMMA_PLACEHOLDER_REF_PRICE = /\{\{(g\d+)\.price\}\}/g;
