import {lineItemsFromCartPayload, variantIdOf} from '../cart/ucp-cart';
import {TECHNICAL_SECTION_HEADER} from '../facts/format-product-block';

function lineTitle(line: Record<string, unknown>): string {
  const item = line.item;
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const title = (item as {title?: unknown}).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  const merchandise = line.merchandise;
  if (merchandise && typeof merchandise === 'object') {
    const product = (merchandise as {product?: {title?: string}}).product;
    if (typeof product?.title === 'string' && product.title.trim()) return product.title.trim();
    const title = (merchandise as {title?: string}).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return 'Pozycja';
}

function variantWords(line: Record<string, unknown>): string | null {
  const merchandise = line.merchandise;
  if (merchandise && typeof merchandise === 'object') {
    const title = (merchandise as {title?: string}).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
    const selected = (merchandise as {selectedOptions?: Array<{value?: string}>})
      .selectedOptions;
    if (Array.isArray(selected)) {
      const vals = selected.map((o) => o?.value).filter(Boolean);
      if (vals.length) return vals.join(', ');
    }
  }
  const item = line.item;
  if (item && typeof item === 'object') {
    const title = (item as {title?: string}).title;
    if (typeof title === 'string' && title.trim()) return title.trim();
  }
  return null;
}

export function cartSummaryBlock(payload: unknown): string {
  const lines = lineItemsFromCartPayload(payload);
  if (!lines.length) return '';
  const descriptive: string[] = ['[KOSZYK SESJI — podsumowanie]'];
  const technical: string[] = [TECHNICAL_SECTION_HEADER];
  for (const line of lines) {
    const rec = line as unknown as Record<string, unknown>;
    const qty = typeof rec.quantity === 'number' ? rec.quantity : 1;
    const title = lineTitle(rec);
    const variant = variantWords(rec);
    descriptive.push(
      `- ${title}, ilość: ${qty}${variant ? `, wariant: ${variant}` : ''}`,
    );
    const vid = variantIdOf(rec);
    if (vid) technical.push(`  ${title} → ${vid}`);
  }
  return [descriptive.join('\n'), technical.length > 1 ? technical.join('\n') : '']
    .filter(Boolean)
    .join('\n\n');
}
