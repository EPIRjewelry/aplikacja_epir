import { describe, expect, it } from 'vitest';
import { googleDocToMarkdown } from '../src/convert/docs-to-markdown.js';
import type { GoogleDocument } from '../src/google/types.js';

describe('googleDocToMarkdown', () => {
  it('converts title, headings and inline styles', () => {
    const doc: GoogleDocument = {
      title: 'Brief kampanii',
      body: {
        content: [
          {
            paragraph: {
              paragraphStyle: { namedStyleType: 'HEADING_2' },
              elements: [{ textRun: { content: 'Sekcja A\n', textStyle: { bold: true } } }],
            },
          },
          {
            paragraph: {
              elements: [
                {
                  textRun: {
                    content: 'Link do sklepu\n',
                    textStyle: { link: { url: 'https://epirbizuteria.pl' } },
                  },
                },
              ],
            },
          },
        ],
      },
    };
    const md = googleDocToMarkdown(doc);
    expect(md).toContain('# Brief kampanii');
    expect(md).toContain('## **Sekcja A**');
    expect(md).toContain('[Link do sklepu](https://epirbizuteria.pl)');
  });

  it('renders simple table', () => {
    const doc: GoogleDocument = {
      body: {
        content: [
          {
            table: {
              tableRows: [
                {
                  tableCells: [
                    { content: [{ paragraph: { elements: [{ textRun: { content: 'A' } }] } }] },
                    { content: [{ paragraph: { elements: [{ textRun: { content: 'B' } }] } }] },
                  ],
                },
                {
                  tableCells: [
                    { content: [{ paragraph: { elements: [{ textRun: { content: '1' } }] } }] },
                    { content: [{ paragraph: { elements: [{ textRun: { content: '2' } }] } }] },
                  ],
                },
              ],
            },
          },
        ],
      },
    };
    const md = googleDocToMarkdown(doc);
    expect(md).toContain('A | B');
    expect(md).toContain('1 | 2');
  });
});
