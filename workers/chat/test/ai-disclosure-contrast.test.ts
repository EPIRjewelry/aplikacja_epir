import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

/** Relative luminance (WCAG 2.1). */
function relLum(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: string, bg: string): number {
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('GE AI disclosure contrast (AI Act art. 50 / WCAG AA)', () => {
  it('assistant-header disclosure color has ≥ 4.5:1 vs #1a1a1a', () => {
    const cssPath = join(
      process.cwd(),
      '../../extensions/asystent-klienta/assets/assistant.css',
    );
    // vitest cwd = workers/chat
    let css: string;
    try {
      css = readFileSync(cssPath, 'utf8');
    } catch {
      css = readFileSync(
        join(
          process.cwd(),
          '../extensions/asystent-klienta/assets/assistant.css',
        ),
        'utf8',
      );
    }
    expect(css).toMatch(
      /\.assistant-header\s+\.epir-assistant__ai-disclosure\s*\{[^}]*color:\s*#e5e7eb/s,
    );
    const ratio = contrastRatio('#e5e7eb', '#1a1a1a');
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
