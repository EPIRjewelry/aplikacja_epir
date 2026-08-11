import type {Env} from './env';
import {
  EPIR_TOKENS,
  resolveAccentStone,
  type EditorialTheme,
} from './design-tokens';

export type {EditorialTheme, HeroMode} from './design-tokens';
export {EPIR_TOKENS} from './design-tokens';

export type ProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  featuredImage?: {url?: string; altText?: string | null} | null;
  priceRange?: {
    minVariantPrice?: {amount?: string; currencyCode?: string};
  };
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function absoluteStoreUrl(env: Env, path: string): string {
  const host = env.SHOPIFY_PUBLIC_DOMAIN?.trim() || 'epirbizuteria.pl';
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `https://${host}${p}`;
}

export function formatPrice(amount?: string, currency?: string): string {
  if (!amount) return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  try {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency || 'PLN',
    }).format(n);
  } catch {
    return `${amount} ${currency || ''}`.trim();
  }
}

export function storeOrigin(env: Env): string {
  return `https://${env.SHOPIFY_PUBLIC_DOMAIN?.trim() || 'epirbizuteria.pl'}`;
}

/** Shared head: fonts + Tailwind + EPIR token CSS (docs/kb/DESIGN_TOKENS.md). */
export function renderEditorialHead(opts: {
  title: string;
  description: string;
  canonical: string;
  theme: EditorialTheme;
}): string {
  const stone = resolveAccentStone(opts.theme);
  const t = EPIR_TOKENS;
  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <meta name="robots" content="noindex" />
  <link rel="canonical" href="${escapeHtml(opts.canonical)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            epir: {
              primary: '${t.bgPrimary}',
              secondary: '${t.bgSecondary}',
              accent: '${t.accent}',
              'accent-hover': '${t.accentHover}',
              cream: '${t.bgCream}',
              ink: '${t.textPrimary}',
              muted: '${t.textMuted}',
              on: '${t.onAccent}',
              field: '${t.field}',
              stone: '${stone}',
            },
          },
          fontFamily: {
            serif: ['"Playfair Display"', 'Georgia', 'serif'],
            sans: ['Montserrat', 'system-ui', 'sans-serif'],
          },
        },
      },
    };
  </script>
  <style>
    :root {
      color-scheme: light;
      --epir-bg-primary: ${t.bgPrimary};
      --epir-bg-secondary: ${t.bgSecondary};
      --epir-bg-accent: ${t.bgAccent};
      --epir-bg-cream: ${t.bgCream};
      --epir-text-primary: ${t.textPrimary};
      --epir-text-muted: ${t.textMuted};
      --epir-on-accent: ${t.onAccent};
      --epir-accent: ${t.accent};
      --epir-accent-hover: ${t.accentHover};
      --epir-field: ${t.field};
      --epir-accent-stone: ${stone};
    }
    body {
      background-color: var(--epir-bg-primary);
      color: var(--epir-text-primary);
    }
    .glass-nav {
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(44, 104, 78, 0.12);
    }
    .panel-secondary {
      background-color: var(--epir-bg-secondary);
    }
    .panel-cream {
      background-color: var(--epir-bg-cream);
    }
    .hero-light {
      background-color: var(--epir-bg-primary);
      color: var(--epir-text-primary);
    }
    .hero-dark {
      background-color: var(--epir-bg-accent);
      color: var(--epir-on-accent);
    }
    .hero-dark .text-epir-muted { color: rgba(255, 255, 255, 0.82); }
    .hero-dark .text-epir-stone { color: rgba(255, 255, 255, 0.9); }
    .hero-visual-light {
      background: linear-gradient(145deg, var(--epir-bg-cream) 0%, var(--epir-bg-secondary) 100%);
      border: 1px solid rgba(44, 104, 78, 0.12);
    }
    .hero-visual-dark {
      background: linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(0,0,0,0.08) 100%);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .product-frame {
      background: var(--epir-bg-secondary);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.06);
    }
    .btn-cta {
      background-color: var(--epir-accent);
      color: var(--epir-on-accent);
      transition: background-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
    }
    .btn-cta:hover {
      background-color: var(--epir-accent-hover);
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(44, 104, 78, 0.22);
    }
    .btn-outline {
      border: 1px solid rgba(44, 104, 78, 0.35);
      color: var(--epir-text-primary);
      transition: border-color 0.25s ease, background 0.25s ease, transform 0.25s ease;
    }
    .btn-outline:hover {
      border-color: var(--epir-accent);
      background: rgba(44, 104, 78, 0.06);
      transform: translateY(-1px);
    }
    .hero-dark .btn-outline {
      border-color: rgba(255, 255, 255, 0.45);
      color: var(--epir-on-accent);
    }
    .hero-dark .btn-outline:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.7);
    }
    .quote-block {
      border-left: 3px solid var(--epir-accent-stone);
      background: var(--epir-bg-cream);
    }
    .step-icon { color: var(--epir-accent-stone); }
    .stone-border { border-color: color-mix(in srgb, var(--epir-accent-stone) 35%, transparent); }
    .stone-ring { box-shadow: 0 0 0 1px color-mix(in srgb, var(--epir-accent-stone) 25%, transparent); }
    .upload-zone {
      border: 2px dashed color-mix(in srgb, var(--epir-accent) 35%, transparent);
      background: var(--epir-field);
      transition: border-color 0.3s ease, background 0.3s ease;
    }
    .upload-zone.drag-over {
      border-color: var(--epir-accent);
      background: rgba(44, 104, 78, 0.06);
    }
    .field-input {
      background: var(--epir-field);
      border: 1px solid rgba(44, 104, 78, 0.2);
      color: var(--epir-text-primary);
    }
    .field-input:focus {
      outline: none;
      border-color: var(--epir-accent);
    }
    #mobile-menu { transition: opacity 0.25s ease, visibility 0.25s ease; }
    #mobile-menu[hidden] { opacity: 0; visibility: hidden; pointer-events: none; }
    #mobile-menu:not([hidden]) { opacity: 1; visibility: visible; }
    .success-panel { animation: fadeUp 0.5s ease forwards; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>`;
}

export function renderNav(
  store: string,
  opts?: {variant?: 'apex' | 'organic'},
): string {
  const variant = opts?.variant ?? 'apex';
  const processLink =
    variant === 'apex'
      ? '<li><a href="#proces" class="hover:text-epir-accent transition-colors">Proces</a></li>'
      : '';
  return `<header class="glass-nav fixed top-0 inset-x-0 z-50">
    <nav class="mx-auto max-w-6xl px-5 md:px-8 flex items-center justify-between h-16" aria-label="Główna nawigacja">
      <a href="${escapeHtml(store)}" class="font-serif text-sm md:text-base tracking-wide text-epir-ink hover:text-epir-accent transition-colors">
        EPIR <span class="text-epir-accent">Art Jewellery</span>
      </a>
      <ul class="hidden md:flex items-center gap-8 text-xs tracking-[0.15em] uppercase text-epir-muted">
        <li><a href="#kolekcje" class="hover:text-epir-accent transition-colors">Kolekcje</a></li>
        ${processLink}
        <li><a href="#pracownia" class="hover:text-epir-accent transition-colors">O Pracowni</a></li>
        <li><a href="#wspoltworzenie" class="btn-cta font-semibold px-5 py-2 rounded-full text-[0.7rem] tracking-wider text-epir-on">Zaprojektuj Swój Model</a></li>
      </ul>
      <button type="button" id="menu-toggle" class="md:hidden p-2 text-epir-accent" aria-expanded="false" aria-controls="mobile-menu" aria-label="Otwórz menu">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </nav>
    <div id="mobile-menu" hidden class="md:hidden glass-nav border-t border-epir-accent/10 bg-white">
      <ul class="flex flex-col px-5 py-4 gap-4 text-sm tracking-widest uppercase text-epir-ink">
        <li><a href="#kolekcje" class="mobile-link block py-2 hover:text-epir-accent">Kolekcje</a></li>
        ${variant === 'apex' ? '<li><a href="#proces" class="mobile-link block py-2 hover:text-epir-accent">Proces</a></li>' : ''}
        <li><a href="#pracownia" class="mobile-link block py-2 hover:text-epir-accent">O Pracowni</a></li>
        <li><a href="#wspoltworzenie" class="mobile-link block py-2 text-epir-accent font-semibold">Zaprojektuj Swój Model</a></li>
      </ul>
    </div>
  </header>`;
}

export function renderProcessSection(steps: Array<{title: string; body: string}>): string {
  const icons = [
    `<path d="M8 36 L8 12 L28 8 L40 16 L40 40 L20 44 Z"/><path d="M14 28 L22 20 L30 26 L36 18"/>`,
    `<path d="M12 36 L12 16 L24 10 L36 16 L36 36 L24 42 Z"/><path d="M18 24 L24 18 L30 24 L24 30 Z"/><circle cx="24" cy="24" r="3" fill="currentColor"/>`,
    `<path d="M16 38 C16 38, 12 28, 16 20 C20 12, 28 10, 32 14 C36 18, 34 30, 28 36 C22 42, 16 38, 16 38 Z"/><path d="M22 22 L26 18 L30 22"/>`,
    `<path d="M10 34 L24 10 L38 34 Z"/><path d="M18 34 L24 22 L30 34"/>`,
  ];
  const items = steps
    .map((step, i) => {
      const icon = icons[i] || icons[0];
      return `<li class="text-center md:text-left">
        <svg class="step-icon w-12 h-12 mx-auto md:mx-0 mb-4" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${icon}</svg>
        <h3 class="font-serif text-lg text-epir-ink mb-2">${i + 1}. ${escapeHtml(step.title)}</h3>
        <p class="text-epir-muted text-sm leading-relaxed">${escapeHtml(step.body)}</p>
      </li>`;
    })
    .join('\n');

  return `<section id="proces" class="py-20 md:py-28 border-t border-epir-accent/10 panel-secondary" aria-labelledby="proces-heading">
    <div class="mx-auto max-w-6xl px-5 md:px-8">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase mb-3 font-sans text-center">Od myśli do metalu</p>
      <h2 id="proces-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-12 text-center">Proces cyfrowo-rzemieślniczy</h2>
      <ol class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 list-none p-0 m-0">${items}</ol>
    </div>
  </section>`;
}

export function renderProductStrip(opts: {
  env: Env;
  products: ProductNode[];
  productIds: string[];
  heading: string;
  eyebrow?: string;
  moreHref: string;
  moreLabel?: string;
}): string {
  const products = opts.products.slice(0, 8);
  if (!products.length) return '';
  const moreLabel = opts.moreLabel || 'Zobacz więcej';
  const cards = products
    .map((p) => {
      const href = absoluteStoreUrl(opts.env, `/products/${p.handle || ''}`);
      const img = p.featuredImage?.url
        ? `<img src="${escapeHtml(p.featuredImage.url)}" alt="${escapeHtml(p.featuredImage.altText || p.title || '')}" loading="lazy" width="400" height="400" class="w-full aspect-square object-cover" />`
        : `<div class="w-full aspect-square bg-epir-secondary" aria-hidden="true"></div>`;
      const price = formatPrice(
        p.priceRange?.minVariantPrice?.amount,
        p.priceRange?.minVariantPrice?.currencyCode,
      );
      return `<a href="${escapeHtml(href)}" class="group block overflow-hidden rounded-xl border stone-border bg-white transition-all duration-300 hover:border-epir-accent/40 hover:shadow-md">
        ${img}
        <div class="p-4">
          <p class="font-serif text-epir-ink text-sm leading-snug group-hover:text-epir-accent transition-colors">${escapeHtml(p.title || '')}</p>
          <p class="mt-1 text-epir-accent-hover text-xs font-sans font-medium">${escapeHtml(price)}</p>
        </div>
      </a>`;
    })
    .join('\n');

  return `<section id="kolekcje" class="py-20 md:py-28 border-t border-epir-accent/10" aria-labelledby="kolekcje-heading">
    <div class="mx-auto max-w-6xl px-5 md:px-8">
      <p class="text-epir-accent text-xs tracking-[0.25em] uppercase font-sans mb-3">${escapeHtml(opts.eyebrow || 'Wybrane z pracowni')}</p>
      <h2 id="kolekcje-heading" class="font-serif text-3xl md:text-4xl text-epir-ink mb-10">${escapeHtml(opts.heading)}</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6" data-dynamic-products data-campaign-product-ids="${escapeHtml(JSON.stringify(opts.productIds))}">
        ${cards}
      </div>
      <div class="mt-10 text-center">
        <a href="${escapeHtml(opts.moreHref)}" class="btn-outline inline-flex items-center justify-center px-8 py-3.5 rounded-full font-medium text-sm tracking-wide" data-dynamic-cta-more>
          ${escapeHtml(moreLabel)}
        </a>
      </div>
    </div>
  </section>`;
}

export function renderFooter(store: string): string {
  return `<footer class="border-t border-epir-accent/10 py-10 panel-secondary">
    <div class="mx-auto max-w-6xl px-5 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-epir-muted text-xs tracking-wider">
      <p class="font-serif text-epir-ink/70">EPIR Art Jewellery — Wrocław</p>
      <p>Pełny sklep: <a href="${escapeHtml(store)}" class="text-epir-accent hover:text-epir-accent-hover transition-colors">${escapeHtml(store.replace(/^https?:\/\//, ''))}</a></p>
    </div>
  </footer>`;
}

export function renderMobileMenuScript(): string {
  return `<script>
    (function () {
      var menuToggle = document.getElementById('menu-toggle');
      var mobileMenu = document.getElementById('mobile-menu');
      var mobileLinks = document.querySelectorAll('.mobile-link');
      function closeMenu() {
        if (!mobileMenu || !menuToggle) return;
        mobileMenu.hidden = true;
        menuToggle.setAttribute('aria-expanded', 'false');
      }
      if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', function () {
          var open = mobileMenu.hidden;
          mobileMenu.hidden = !open;
          menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        mobileLinks.forEach(function (link) {
          link.addEventListener('click', closeMenu);
        });
      }
    })();
  </script>`;
}

export function heroSectionClass(heroMode: 'light' | 'dark'): string {
  return heroMode === 'dark' ? 'hero-dark' : 'hero-light';
}

export function heroVisualClass(heroMode: 'light' | 'dark'): string {
  return heroMode === 'dark' ? 'hero-visual-dark' : 'hero-visual-light';
}
