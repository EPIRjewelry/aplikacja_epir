/**
 * Metadane persony wyłącznie do UI (nagłówki, puste stany).
 * Nie zawiera promptu systemowego ani sekretów — SSOT biznesowy może być później w Shopify metaobject / workerze.
 *
 * chatTitle / displayName pochodzą z ai_profile (EPIR / KAZKA / Zaręczyny) i NIE są nadpisywane
 * etykietą AI Act — ta jest osobnym, stałym dopiskiem w nagłówku.
 */
export type PersonaUi = {
  /** Imię asystenta (zgodne z personą modelu, np. Gemma). */
  displayName: string;
  /** Tytuł panelu czatu i strony `/chat` — z ai_profile.chat_title. */
  chatTitle: string;
  /** Tekst gdy brak wiadomości w panelu widgetu. */
  emptyState?: string;
  locale?: string;
};

/**
 * Stała etykieta AI Act art. 50 ust. 1 — nie zastępuje chat_title / assistant_display_name.
 * @see https://eur-lex.europa.eu/eli/reg/2024/1689/oj
 */
export const AI_ASSISTANT_DISCLOSURE = 'asystentka AI';

/** Domyślna persona buyer-facing zgodna z promptem produkcyjnym (Gemma). */
export const DEFAULT_PERSONA_UI: PersonaUi = {
  displayName: 'Gemma',
  chatTitle: 'Czat z Gemmą',
  emptyState: 'Napisz wiadomość, aby rozpocząć.',
};

/** Nagłówek: tytuł z profilu + osobna etykieta AI (bez nadpisywania tytułu). */
export function chatHeaderParts(persona: Pick<PersonaUi, 'chatTitle' | 'displayName'>): {
  chatTitle: string;
  displayName: string;
  aiDisclosure: string;
} {
  return {
    chatTitle: persona.chatTitle,
    displayName: persona.displayName,
    aiDisclosure: AI_ASSISTANT_DISCLOSURE,
  };
}
