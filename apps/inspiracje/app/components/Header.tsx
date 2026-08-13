import {useEffect, useState} from 'react';
import {Link} from '@remix-run/react';

export type HeaderProps = {
  mainShopUrl: string;
  ctaUrl: string;
  ctaLabel?: string;
};

export function Header({
  mainShopUrl,
  ctaUrl,
  ctaLabel = 'Zaprojektuj swój model',
}: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      const next = window.scrollY > 0;
      setIsScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 flex h-[var(--height-nav)] w-full items-center border-b border-[rgb(var(--color-primary))]/10 bg-[rgb(var(--color-contrast))]/90 px-6 backdrop-blur-sm transition-[box-shadow] duration-200 ease-out data-[scrolled=true]:shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:px-8 lg:px-12"
      {...(isScrolled ? {'data-scrolled': 'true'} : {})}
    >
      <div className="flex w-full items-center gap-4 md:gap-6">
        <Link
          to="/"
          className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2"
          aria-label="Archiwum Inspiracji EPIR — strona główna"
        >
          <span className="font-bold text-xl tracking-wide" aria-hidden>
            EPIR
          </span>
          <span
            className="font-normal text-xs leading-snug text-[rgb(var(--color-primary))]/65 sm:text-[0.8125rem]"
            aria-hidden
          >
            Archiwum Inspiracji
          </span>
        </Link>

        <nav
          className="ml-auto flex flex-wrap items-center justify-end gap-3 sm:gap-4"
          aria-label="Nawigacja"
        >
          <a
            href={ctaUrl}
            className="inline-flex items-center justify-center bg-epir-accent px-3.5 py-2 text-xs font-semibold tracking-wide text-epir-on transition-colors hover:bg-epir-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-epir-accent focus-visible:outline-offset-2 sm:px-4 sm:text-sm"
            rel="noopener noreferrer"
          >
            {ctaLabel}
          </a>
          <a
            href={mainShopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center border-b-2 border-epir-ink pb-0.5 text-sm font-semibold text-epir-ink no-underline transition-colors hover:border-epir-accent hover:text-epir-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-epir-accent focus-visible:outline-offset-2"
            aria-label="Sklep EPIR — otwiera główny sklep w nowej karcie"
          >
            Sklep →
          </a>
        </nav>
      </div>
    </header>
  );
}
