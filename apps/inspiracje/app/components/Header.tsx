import {useEffect, useState} from 'react';
import {Link, NavLink} from '@remix-run/react';

const NAV_LINK =
  'font-medium text-[rgb(var(--color-primary))] no-underline underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out hover:text-[rgb(var(--color-accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

export type HeaderProps = {
  mainShopUrl: string;
  ctaUrl: string;
};

export function Header({mainShopUrl, ctaUrl}: HeaderProps) {
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
            className="hidden font-normal text-xs leading-snug text-[rgb(var(--color-primary))]/65 md:inline md:text-[0.8125rem]"
            aria-hidden
          >
            Archiwum Inspiracji
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-4 sm:gap-6" aria-label="Nawigacja">
          <NavLink to="/" prefetch="intent" className={NAV_LINK} end>
            Galeria
          </NavLink>
          <a
            href={ctaUrl}
            className={`${NAV_LINK} font-semibold`}
            rel="noopener noreferrer"
          >
            Współtwórz
          </a>
          <a
            href={mainShopUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${NAV_LINK} font-semibold underline decoration-[rgb(var(--color-accent))] decoration-1 underline-offset-[3px] hover:decoration-2`}
            aria-label="Sklep EPIR — otwiera główny sklep w nowej karcie"
          >
            Sklep →
          </a>
        </nav>
      </div>
    </header>
  );
}
