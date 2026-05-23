/**
 * Google Docs (JSON z documents.get) → Markdown — redukcja tokenów vs surowy HTML/XML.
 */
import type {
  DocsParagraph,
  DocsParagraphElement,
  DocsStructuralElement,
  DocsTable,
  DocsTextRun,
  GoogleDocument,
} from '../google/types.js';

const HEADING_MAP: Record<string, string> = {
  TITLE: '# ',
  SUBTITLE: '## ',
  HEADING_1: '# ',
  HEADING_2: '## ',
  HEADING_3: '### ',
  HEADING_4: '#### ',
  HEADING_5: '##### ',
  HEADING_6: '###### ',
};

function applyInlineStyle(text: string, run: DocsTextRun): string {
  let out = text;
  const style = run.textStyle;
  if (!style) return out;

  if (style.link?.url) {
    const url = style.link.url.trim();
    out = `[${out}](${url})`;
  }
  if (style.bold) out = `**${out}**`;
  if (style.italic) out = `*${out}*`;
  if (style.strikethrough) out = `~~${out}~~`;
  if (style.underline && !style.link?.url) out = `<u>${out}</u>`;
  return out;
}

function paragraphElementsToMarkdown(elements: DocsParagraphElement[] | undefined): string {
  if (!elements?.length) return '';
  let parts = '';
  for (const el of elements) {
    const run = el.textRun;
    if (!run?.content) continue;
    const raw = run.content;
    if (raw === '\n') {
      parts += '\n';
      continue;
    }
    parts += applyInlineStyle(raw.replace(/\n$/, ''), run);
  }
  return parts.trimEnd();
}

function paragraphToMarkdown(p: DocsParagraph, listState: ListState): string {
  const text = paragraphElementsToMarkdown(p.elements);
  const named = p.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT';
  const bullet = p.paragraphStyle?.bullet;
  const prefix = HEADING_MAP[named];

  if (bullet?.listId) {
    const level = bullet.nestingLevel ?? 0;
    const indent = '  '.repeat(level);
    const marker = listState.ordered.has(bullet.listId) ? `${listState.next(bullet.listId)}.` : '-';
    listState.touch(bullet.listId);
    return `${indent}${marker} ${text}`.trim();
  }

  if (prefix && text) return `${prefix}${text}`.trim();
  if (!text) return '';
  return text;
}

type ListState = {
  readonly ordered: Set<string>;
  counters: Map<string, number>;
  touch(id: string): void;
  next(id: string): number;
};

function createListState(): ListState {
  const counters = new Map<string, number>();
  const ordered = new Set<string>();
  return {
    ordered,
    counters,
    touch(id: string) {
      if (!counters.has(id)) counters.set(id, 0);
    },
    next(id: string) {
      const n = (counters.get(id) ?? 0) + 1;
      counters.set(id, n);
      return n;
    },
  };
}

function tableToMarkdown(table: DocsTable): string {
  const rows = table.tableRows ?? [];
  if (!rows.length) return '';

  const mdRows: string[][] = [];
  for (const row of rows) {
    const cells = row.tableCells ?? [];
    const line: string[] = [];
    for (const cell of cells) {
      const chunks: string[] = [];
      for (const el of cell.content ?? []) {
        if (el.paragraph) {
          const t = paragraphElementsToMarkdown(el.paragraph.elements);
          if (t) chunks.push(t.replace(/\|/g, '\\|').replace(/\n/g, ' '));
        }
      }
      line.push(chunks.join(' ').trim());
    }
    mdRows.push(line);
  }

  if (!mdRows.length) return '';
  const width = Math.max(...mdRows.map((r) => r.length));
  const normalized = mdRows.map((r) => {
    while (r.length < width) r.push('');
    return r;
  });

  const header = normalized[0] ?? [];
  const sep = header.map(() => '---');
  const body = normalized.slice(1);
  return [header.join(' | '), sep.join(' | '), ...body.map((r) => r.join(' | '))].join('\n');
}

function structuralElementsToMarkdown(
  elements: DocsStructuralElement[] | undefined,
  listState: ListState,
): string {
  if (!elements?.length) return '';
  const blocks: string[] = [];

  for (const el of elements) {
    if (el.paragraph) {
      const line = paragraphToMarkdown(el.paragraph, listState);
      if (line) blocks.push(line);
    } else if (el.table) {
      const t = tableToMarkdown(el.table);
      if (t) blocks.push(t);
    }
  }

  return blocks.join('\n\n');
}

/** Konwertuje dokument Google Docs API na Markdown. */
export function googleDocToMarkdown(doc: GoogleDocument): string {
  const title = doc.title?.trim();
  const body = structuralElementsToMarkdown(doc.body?.content, createListState());
  if (title && body) return `# ${title}\n\n${body}`;
  if (title) return `# ${title}`;
  return body;
}
