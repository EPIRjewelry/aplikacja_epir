export type KbQaEntry = {
  question: string;
  answer: string;
  sourceTitle?: string;
};

export const KB_CONTEXT_ASSUMING_MARKERS: RegExp[] = [
  /\bpokazał[aeś]/iu,
  /\bwcześniej\s+(pokaza|wspomnia|przesła)/iu,
  /\bten\s+plik\b/iu,
  /\btwój\s+projekt\b/iu,
  /\bprzesła[łeś]/iu,
  /\bprojekt\s+3d\b/iu,
];

export const KB_TOP_K = 2;
export const KB_ANSWER_MAX_CHARS = 900;

export function kbEntryAssumesChatContext(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return KB_CONTEXT_ASSUMING_MARKERS.some((re) => re.test(t));
}

function tokenizeForScore(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return new Set(words);
}

export function scoreKbEntry(query: string, entry: KbQaEntry): number {
  const q = tokenizeForScore(query);
  if (!q.size) return 0;
  const blob = `${entry.question} ${entry.answer}`;
  const tokens = tokenizeForScore(blob);
  let hit = 0;
  for (const w of q) {
    if (tokens.has(w)) hit += 1;
  }
  return hit;
}

export function selectTopKbEntries(query: string, entries: KbQaEntry[]): {entries: KbQaEntry[]} {
  const kept: {entry: KbQaEntry; score: number}[] = [];
  for (const entry of entries) {
    const combined = `${entry.question}\n${entry.answer}`;
    if (kbEntryAssumesChatContext(combined)) {
      console.log(
        JSON.stringify({
          tag: 'kb.entry_rejected',
          reason: 'context_assuming',
          question: entry.question.slice(0, 120),
        }),
      );
      continue;
    }
    kept.push({entry, score: scoreKbEntry(query, entry)});
  }
  kept.sort((a, b) => b.score - a.score);
  return {entries: kept.slice(0, KB_TOP_K).map((k) => k.entry)};
}

export function formatKbEntries(entries: KbQaEntry[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const e of entries) {
    const block =
      e.question && e.answer ? `${e.question}\n${e.answer}` : e.question || e.answer;
    if (!block.trim()) continue;
    if (total + block.length > KB_ANSWER_MAX_CHARS && parts.length > 0) break;
    parts.push(block);
    total += block.length + 2;
  }
  return parts.join('\n\n').trim();
}
