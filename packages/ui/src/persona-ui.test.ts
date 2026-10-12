import {describe, expect, it} from 'vitest';
import {
  AI_ASSISTANT_DISCLOSURE,
  DEFAULT_PERSONA_UI,
  chatHeaderParts,
} from './persona-ui';

describe('persona UI — AI disclosure does not overwrite ai_profile titles', () => {
  it('keeps DEFAULT chatTitle and displayName unchanged by disclosure constant', () => {
    expect(DEFAULT_PERSONA_UI.chatTitle).toBe('Czat z Gemmą');
    expect(DEFAULT_PERSONA_UI.displayName).toBe('Gemma');
    expect(AI_ASSISTANT_DISCLOSURE).toBe('asystentka AI');
    expect(DEFAULT_PERSONA_UI.chatTitle).not.toContain(AI_ASSISTANT_DISCLOSURE);
    expect(DEFAULT_PERSONA_UI.displayName).not.toContain(AI_ASSISTANT_DISCLOSURE);
  });

  it('preserves storefront-specific chat_title from ai_profile (EPIR / KAZKA / Zaręczyny)', () => {
    const profiles = [
      {displayName: 'Gemma', chatTitle: 'Czat EPIR'},
      {displayName: 'Gemma Kazka', chatTitle: 'Czat Kazka'},
      {displayName: 'Gemma Zaręczyny', chatTitle: 'Czat Zaręczyny'},
    ];
    for (const profile of profiles) {
      const parts = chatHeaderParts(profile);
      expect(parts.chatTitle).toBe(profile.chatTitle);
      expect(parts.displayName).toBe(profile.displayName);
      expect(parts.aiDisclosure).toBe('asystentka AI');
      expect(parts.chatTitle).not.toBe(parts.aiDisclosure);
    }
  });
});
