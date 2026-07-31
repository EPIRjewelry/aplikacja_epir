import {useEffect, useState} from 'react';
import {Link, NavLink} from '@remix-run/react';

export type NavCollection = {id: string; title: string; handle: string};

export type HeaderProps = {
  brandName: string;
  collections: NavCollection[];
  cartQuantity: number;
  onOpenCart: () => void;
  renderCartHeader: (props: {
    cartQuantity: number;
    openDrawer: () => void;
  }) => React.ReactNode;
};

const NAV_LINK =
  'site-header__nav-link font-medium text-[rgb(var(--color-primary))] no-underline underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out hover:text-[rgb(var(--color-accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

function collectionNavLinkClass({isActive}: {isActive: boolean}) {
  return [NAV_LINK, isActive ? 'underline decoration-[rgb(var(--color-accent))]' : '']
    .filter(Boolean)
    .join(' ');
}

const iconBtnClass =
  'site-header__icon-btn inline-flex cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent p-[0.4rem] text-[rgb(var(--color-primary))] transition-[color,background-color,border-color] duration-150 ease-out hover:bg-[rgba(10,22,40,0.05)] hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 active:text-[rgb(var(--color-accent))]';

export function Header({
  brandName,
  collections,
  cartQuantity,
  onOpenCart,
  renderCartHeader,
}: HeaderProps) {
  void renderCartHeader;

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

  const itemCount = cartQuantity ?? 0;
  const navCollections = collections.slice(0, 6);

  const collectionNavItems =
    navCollections.length > 0 ? (
      navCollections.map((c) => (
        <li key={c.id} className="site-header__nav-item">
          <NavLink
            to={`/collections/${c.handle}`}
            prefetch="intent"
            className={collectionNavLinkClass}
          >
            {c.title}
          </NavLink>
        </li>
      ))
    ) : (
      <li className="site-header__nav-item">
        <NavLink to="/collections" prefetch="intent" className={collectionNavLinkClass}>
          Kolekcje
        </NavLink>
      </li>
    );

  return (
    <header
      role="banner"
      className="site-header flex h-[var(--height-nav)] sticky top-0 z-50 w-full items-center border-b border-[rgb(var(--color-primary))]/10 bg-[rgb(var(--color-contrast))] px-6 leading-none transition-[box-shadow] duration-200 ease-out data-[scrolled=true]:shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:px-8 lg:px-12"
      {...(isScrolled ? {'data-scrolled': 'true'} : {})}
    >
      <div className="site-header__inner flex w-full items-center gap-4 md:gap-6">
        <div className="site-header__left flex min-w-0 shrink-0 flex-col gap-0 sm:flex-row sm:items-baseline sm:gap-2 md:gap-3">
          <Link
            to="/"
            className="site-header__brand inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2"
            aria-label={`Przejdź do strony głównej ${brandName}`}
          >
            <span className="site-header__logo-text font-bold text-xl tracking-wide" aria-hidden>
              EPIR
            </span>
            <span
              className="site-header__tagline hidden font-normal text-xs leading-snug text-[rgb(var(--color-primary))]/65 md:inline md:text-[0.8125rem]"
              aria-hidden
            >
              Kazka — biżuteria inspirowana naturą
            </span>
          </Link>
        </div>
        <div className="site-header__center hidden min-w-0 flex-1 justify-center sm:flex">
          <nav className="site-header__nav" aria-label="Nawigacja kolekcji">
            <ul className="site-header__nav-list flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-6">
              {collectionNavItems}
              <li className="site-header__nav-item">
                <NavLink to="/chat" prefetch="intent" className={NAV_LINK}>
                  Czat
                </NavLink>
              </li>
              <li className="site-header__nav-item">
                <a
                  href="https://epirbizuteria.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${NAV_LINK} font-semibold underline decoration-[rgb(var(--color-accent))] decoration-1 underline-offset-[3px] hover:decoration-2`}
                  aria-label="Cały sklep – otwiera główny sklep EPIR w nowej karcie"
                >
                  Cały sklep →
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="site-header__right flex shrink-0 items-center justify-end gap-x-3 sm:gap-x-4">
          <Link
            id="header-search-trigger"
            to="/search"
            prefetch="intent"
            className={`${iconBtnClass} site-header__icon-btn--search no-underline`}
            aria-label="Otwórz wyszukiwarkę"
          >
            <span className="site-header__icon text-[1.1rem] leading-none" aria-hidden>
              🔍
            </span>
          </Link>
          <button
            type="button"
            id="header-cart-trigger"
            className={`${iconBtnClass} site-header__icon-btn--cart`}
            aria-label={itemCount > 0 ? `Otwórz koszyk (${itemCount})` : 'Otwórz koszyk'}
            onClick={onOpenCart}
          >
            <span className="site-header__icon text-[1.1rem] leading-none" aria-hidden>
              🛒
            </span>
            {itemCount > 0 ? (
              <span className="site-header__cart-badge ml-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-[rgb(var(--color-primary))] px-[0.3rem] text-[0.7rem] font-semibold leading-none text-[rgb(var(--color-contrast))]">
                {itemCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
