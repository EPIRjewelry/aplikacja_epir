import {escapeHtml} from './render-shared';
import {shopifyCdnSrcset, shopifyCdnWidth} from './shopify-cdn';

export type HeroPictureOpts = {
  url: string;
  alt: string;
  /** LCP hero: high priority + eager. Featured/secondary: false. */
  lcp?: boolean;
  className?: string;
  /** Intrinsic ratio for CLS; default 2048. */
  width?: number;
  height?: number;
};

const HERO_SIZES =
  '(max-width: 767px) 92vw, (max-width: 1023px) 45vw, 560px';

/**
 * Responsive Shopify CDN &lt;picture&gt; for landing heroes.
 * Breakpoints: mobile 768/1536, tablet 1280/2048, desktop img 1600.
 */
export function renderHeroPicture(opts: HeroPictureOpts): string {
  const url = String(opts.url || '').trim();
  if (!url) return '';

  const alt = escapeHtml(opts.alt || '');
  const w = opts.width ?? 2048;
  const h = opts.height ?? 2048;
  const cls = escapeHtml(opts.className || 'w-full h-full object-cover');
  const lcp = opts.lcp !== false;

  const mobileSrcset = shopifyCdnSrcset(url, [768, 1536]);
  const tabletSrcset = shopifyCdnSrcset(url, [1280, 2048]);
  const desktopSrc = shopifyCdnWidth(url, 1600);

  const priorityAttrs = lcp
    ? 'fetchpriority="high" loading="eager"'
    : 'loading="lazy"';

  return `<picture>
  <source media="(max-width: 767px)" srcset="${escapeHtml(mobileSrcset)}" sizes="${HERO_SIZES}" />
  <source media="(max-width: 1023px)" srcset="${escapeHtml(tabletSrcset)}" sizes="${HERO_SIZES}" />
  <img src="${escapeHtml(desktopSrc)}" alt="${alt}" width="${w}" height="${h}" class="${cls}" decoding="async" ${priorityAttrs} sizes="${HERO_SIZES}" />
</picture>`;
}
