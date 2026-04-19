import { describe, expect, it } from 'vitest';

import { LUXURY_SYSTEM_PROMPT } from '../src/prompts/luxury-system-prompt';

describe('LUXURY_SYSTEM_PROMPT continuity guardrails', () => {
  it('keeps current-session continuity and logged-in memory references without buyer-facing disclaimers', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('tej samej rozmowie');
    expect(LUXURY_SYSTEM_PROMPT).toContain('bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).toContain('zalogowanego klienta');
    expect(LUXURY_SYSTEM_PROMPT).toContain('Naturalnie nawiązuj do wiadomości z tej samej sesji');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('nie udawaj');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('O braku pamięci spoza bieżącej sesji');
  });

  it('treats recap questions as current-session questions by default', () => {
    expect(LUXURY_SYSTEM_PROMPT).toContain('o czym rozmawialiśmy');
    expect(LUXURY_SYSTEM_PROMPT).toContain('czego szukałem');
    expect(LUXURY_SYSTEM_PROMPT).toContain('odpowiedz na podstawie historii bieżącej sesji');
    expect(LUXURY_SYSTEM_PROMPT).not.toContain('wspominaj tylko wtedy');
  });
});