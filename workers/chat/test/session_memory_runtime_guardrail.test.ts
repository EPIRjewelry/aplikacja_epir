import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('session memory runtime guardrail', () => {
  test('runtime assembly keeps same-session visibility marker without old cross-session disclaimer marker', () => {
    const indexPath = path.resolve(__dirname, '../src/index.ts');
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain('Nie twierdź, że nie widzisz bieżącej rozmowy');
    expect(source).not.toContain('brak potwierdzonej pamięci klienta z wcześniejszych wizyt');
    expect(source).not.toContain('Historia bieżącej sesji pozostaje dostępna w wiadomościach.');
    expect(source).not.toContain('O braku pamięci spoza sesji wspominaj tylko wtedy');
  });
});