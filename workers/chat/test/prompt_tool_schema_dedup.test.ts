import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('prompt assembly tool schema deduplication', () => {
  test('passes tool definitions natively without serializing them into a system message', () => {
    const indexPath = path.resolve(__dirname, '../src/index.ts');
    const source = fs.readFileSync(indexPath, 'utf8');

    expect(source).toContain('const toolDefinitions = schemasToUse.map((schema) => ({');
    expect(source).toContain('streamGroqEvents(');
    expect(source).not.toContain('Oto dostępne schematy narzędzi:');
    expect(source).not.toContain('const toolSchemaString = JSON.stringify(toolDefinitions, null, 2);');
  });
});