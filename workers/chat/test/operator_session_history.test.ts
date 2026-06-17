import { describe, expect, it } from 'vitest';
import { formatOperatorSessionMarkdown } from '../src/operator/operator-session-history';

describe('operator-session-history', () => {
  it('formats markdown with role and messages', () => {
    const md = formatOperatorSessionMarkdown('analyst', 'sess-1', [
      { role: 'user', content: 'Pokaż raport' },
      { role: 'assistant', content: 'Oto podsumowanie.' },
    ]);
    expect(md).toContain('# Operator Studio — Analityk');
    expect(md).toContain('sess-1');
    expect(md).toContain('## Ty');
    expect(md).toContain('Pokaż raport');
    expect(md).toContain('## Asystent');
  });

  it('uses CAD label for design_blender', () => {
    const md = formatOperatorSessionMarkdown('design_blender', 'cad-sess', [
      { role: 'user', content: 'ping' },
    ]);
    expect(md).toContain('Blender / CAD');
  });
});
