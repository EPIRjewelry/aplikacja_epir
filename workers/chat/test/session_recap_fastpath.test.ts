import { describe, expect, it } from 'vitest';

import { buildCurrentSessionRecapResponse, isCurrentSessionRecapQuestion } from '../src/index';

describe('session recap fast-path', () => {
  it('recognizes recap intent in Polish variants', () => {
    expect(isCurrentSessionRecapQuestion('O czym rozmawialiśmy?')).toBe(true);
    expect(isCurrentSessionRecapQuestion('Przypomnij tę rozmowę proszę')).toBe(true);
    expect(isCurrentSessionRecapQuestion('Szukam pierścionka zaręczynowego')).toBe(false);
  });

  it('builds deterministic recap from earlier user turns in current session', () => {
    const response = buildCurrentSessionRecapResponse(
      'O czym rozmawialiśmy?',
      [
        { role: 'user', content: 'Szukam pierścionka z szafirem.', ts: 1000 },
        { role: 'assistant', content: 'Mam kilka opcji z szafirem.', ts: 1100 },
        { role: 'user', content: 'W budżecie do 3000 zł.', ts: 1200 },
        { role: 'assistant', content: 'To zawęża wybór do 3 modeli.', ts: 1300 },
        { role: 'user', content: 'O czym rozmawialiśmy?', ts: 1400 },
      ],
      1400,
    );

    expect(response).toContain('W tej rozmowie wcześniej poruszyliśmy tematy');
    expect(response).toContain('Szukam pierścionka z szafirem.');
    expect(response).toContain('W budżecie do 3000 zł.');
  });

  it('returns null when there is no earlier user turn to summarize', () => {
    const response = buildCurrentSessionRecapResponse(
      'O czym rozmawialiśmy?',
      [{ role: 'user', content: 'O czym rozmawialiśmy?', ts: 2000 }],
      2000,
    );

    expect(response).toBeNull();
  });
});
