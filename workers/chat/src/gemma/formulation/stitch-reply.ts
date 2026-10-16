import {GEMMA_PLACEHOLDER_REF, GEMMA_PLACEHOLDER_REF_PRICE} from './constants';
import type {TurnFacts} from './types';
import type {ParsedFormulation} from './types';

function refMap(turn: TurnFacts): Map<string, {url: string; priceDisplay: string}> {
  const m = new Map<string, {url: string; priceDisplay: string}>();
  for (const p of turn.products) {
    m.set(p.ref, {url: p.url, priceDisplay: p.priceDisplay});
  }
  return m;
}

export function stitchFormulationReply(turn: TurnFacts, parsed: ParsedFormulation): string {
  const map = refMap(turn);
  let text = parsed.text;

  text = text.replace(GEMMA_PLACEHOLDER_REF_PRICE, (_full, ref: string) => {
    return map.get(ref)?.priceDisplay ?? '';
  });
  text = text.replace(GEMMA_PLACEHOLDER_REF, (_full, ref: string) => {
    return map.get(ref)?.url ?? '';
  });

  const lines: string[] = [];
  for (const ref of parsed.product_refs) {
    if (text.includes(ref) && text.includes(map.get(ref)?.url ?? '___')) continue;
    const p = map.get(ref);
    if (!p?.url) continue;
    const line = `${ref}: ${p.url} ${p.priceDisplay}`.trim();
    if (!text.includes(line)) lines.push(line);
  }
  if (lines.length) {
    text = text.trim() + (text.trim() ? '\n' : '') + lines.join('\n');
  }
  return text.trim();
}
