/**
 * Metadane persony wyłącznie do UI (nagłówki, puste stany).
 * Nie zawiera promptu systemowego ani sekretów — SSOT biznesowy może być później w Shopify metaobject / workerze.
 */
export type PersonaUi = {
  /** Imię asystenta (zgodne z personą modelu, np. Gemma). */
  displayName: string;
  /** Tytuł panelu czatu i strony `/chat`. */
  chatTitle: string;
  /** Tekst gdy brak wiadomości w panelu widgetu. */
  emptyState?: string;
  locale?: string;
};

/** Domyślna persona buyer-facing zgodna z promptem produkcyjnym (Gemma). */
export const DEFAULT_PERSONA_UI: PersonaUi = {
  displayName: 'Gemma',
  chatTitle: 'Czat z Gemmą',
  emptyState: 'Napisz wiadomość, aby rozpocząć.',
};
