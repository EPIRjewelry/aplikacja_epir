import {useEffect, useState} from 'react';
import {Link, NavLink, useLocation} from '@remix-run/react';

const NAV_HANDLE_ORDER = ['zareczyny-zlote', 'zareczyny-srebrne'] as const;

function collectionNavLinkClass({isActive}: {isActive: boolean}) {
  return [
    'site-header__nav-link',
    'text-[#2c684e] font-medium no-underline underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out',
    'hover:text-[#8a8175] hover:underline',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2',
    'active:text-[#8a8175]',
    isActive ? 'underline decoration-[#2c684e]' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
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

const iconBtnClass =
  'site-header__icon-btn inline-flex cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent p-[0.4rem] text-[#2c684e] transition-[color,background-color,border-color] duration-150 ease-out hover:bg-[rgba(44,104,78,0.04)] hover:text-[#8a8175] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2 active:border-[rgba(44,104,78,0.35)] active:text-[#8a8175]';

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

  const location = useLocation();
  const currentPath = location.pathname;
  const itemCount = cartQuantity ?? 0;

  // Determine which collection links to show
  let navLinks: NavCollection[] = [];

  if (currentPath === '/') {
    // Homepage: show both collections (filter out the hub "Pierścionki zaręczynowe")
    navLinks = collections.filter(
      (c) => c.handle === 'zareczyny-zlote' || c.handle === 'zareczyny-srebrne'
    );
  } else if (currentPath.includes('zareczyny-srebrne')) {
    // On srebrne collection: show only zlote link
    navLinks = collections.filter((c) => c.handle === 'zareczyny-zlote');
  } else if (currentPath.includes('zareczyny-zlote')) {
    // On zlote collection: show only srebrne link
    navLinks = collections.filter((c) => c.handle === 'zareczyny-srebrne');
  } else {
    // Other pages: show both
    navLinks = collections.filter(
      (c) => c.handle === 'zareczyny-zlote' || c.handle === 'zareczyny-srebrne'
    );
  }

  const sortedNavLinks = [...navLinks].sort(
    (a, b) =>
      NAV_HANDLE_ORDER.indexOf(a.handle as (typeof NAV_HANDLE_ORDER)[number]) -
      NAV_HANDLE_ORDER.indexOf(b.handle as (typeof NAV_HANDLE_ORDER)[number]),
  );

  const collectionNavItems =
    sortedNavLinks.length > 0 ? (
      sortedNavLinks.map((c) => (
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
      className="site-header flex h-[var(--height-nav)] sticky top-0 z-50 w-full items-center border-b border-[#2c684e]/15 bg-[var(--color-header-bg,#F5F0E8)] px-6 leading-none transition-[box-shadow] duration-200 ease-out data-[scrolled=true]:shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:px-8 lg:px-12"
      {...(isScrolled ? {'data-scrolled': 'true'} : {})}
    >
      <div className="site-header__inner flex w-full items-center gap-4 md:gap-6">
        <div className="site-header__left flex min-w-0 shrink-0 flex-col gap-0 sm:flex-row sm:items-baseline sm:gap-2 md:gap-3">
          <Link
            to="/"
            className="site-header__brand inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2"
            aria-label={`Przejdź do strony głównej ${brandName}`}
          >
            <span className="site-header__logo-text font-bold text-xl tracking-wide" aria-hidden>
              EPIR
            </span>
            <span
              className="site-header__tagline hidden font-normal text-xs leading-snug text-[rgb(var(--color-primary))]/65 md:inline md:text-[0.8125rem]"
              aria-hidden
            >
              Pracownia EPIR ART Jewellery
            </span>
          </Link>
        </div>
        <div className="site-header__center hidden min-w-0 flex-1 justify-center sm:flex">
          <nav className="site-header__nav" aria-label="Nawigacja kolekcji">
            <ul className="site-header__nav-list flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:gap-x-6">
              {collectionNavItems}
              <li className="site-header__nav-item">
                <a
                  href="https://epirbizuteria.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="site-header__nav-link site-header__nav-link--highlight font-semibold text-[#2c684e] underline decoration-[#2c684e] decoration-1 underline-offset-[3px] transition-[color,text-decoration-thickness] duration-150 ease-out hover:text-[#2c684e] hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2 active:text-[#8a8175]"
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
              <span className="site-header__cart-badge ml-1 inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center rounded-full bg-[#2c684e] px-[0.3rem] text-[0.7rem] font-semibold leading-none text-[#F5F0E8]">
                {itemCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}