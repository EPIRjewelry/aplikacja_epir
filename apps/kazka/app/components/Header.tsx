import {useEffect, useState} from 'react';
import {Link, NavLink} from '@remix-run/react';
import {
  EPIR_GOLD_COLLECTION_URL,
  EPIR_GOLD_HEADER_CTA,
  KAZKA_COLLECTION_NAV_LABEL,
  KAZKA_HEADER_BRAND,
  KAZKA_HEADER_DESCRIPTOR,
  KAZKA_HEADER_TRUST,
} from '~/lib/kazka-header';

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
  'site-header__nav-link kazka-editorial-label text-[rgb(var(--color-primary))] no-underline transition-[color,opacity] duration-150 ease-out hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

function collectionNavLinkClass({isActive}: {isActive: boolean}) {
  return [
    NAV_LINK,
    isActive ? 'text-[rgb(var(--color-accent))]' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

const iconBtnClass =
  'site-header__icon-btn inline-flex cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent p-[0.4rem] text-[rgb(var(--color-primary))] transition-[color,background-color,border-color] duration-150 ease-out hover:bg-[rgba(10,22,40,0.05)] hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 active:text-[rgb(var(--color-accent))]';

const headerCtaClass =
  'site-header__cta kazka-editorial-label hidden items-center gap-1 whitespace-nowrap border border-[rgb(var(--color-primary))]/20 px-3 py-2 text-[rgb(var(--color-primary))] no-underline transition-[border-color,color,background-color] duration-150 ease-out hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 md:inline-flex';

export function Header({
  brandName,
  collections,
  cartQuantity,
  onOpenCart,
  renderCartHeader,
}: HeaderProps) {
  void renderCartHeader;
  void collections;

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

  return (
    <header
      role="banner"
      className="site-header flex h-[var(--height-nav)] sticky top-0 z-50 w-full items-center border-b border-[rgb(var(--color-primary))]/10 bg-[rgb(var(--color-contrast))] px-6 leading-none transition-[box-shadow] duration-200 ease-out data-[scrolled=true]:shadow-[0_2px_12px_rgba(0,0,0,0.06)] md:px-8 lg:px-12"
      {...(isScrolled ? {'data-scrolled': 'true'} : {})}
    >
      <div className="site-header__inner grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4 md:gap-6">
        <div className="site-header__left min-w-0 justify-self-start">
          <Link
            to="/"
            className="site-header__brand group inline-flex max-w-full flex-col gap-0.5 rounded-sm transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2"
            aria-label={`Przejdź do strony głównej ${brandName}`}
          >
            <span className="site-header__logo-text font-semibold text-[1.05rem] leading-tight tracking-[0.04em] text-[rgb(var(--color-primary))] sm:text-[1.125rem]">
              {KAZKA_HEADER_BRAND}
            </span>
            <span className="site-header__descriptor kazka-editorial-label text-[0.65rem] tracking-[0.14em] text-[rgb(var(--color-primary))]/70 sm:text-[0.6875rem]">
              {KAZKA_HEADER_DESCRIPTOR}
            </span>
            <span className="site-header__trust hidden text-[0.625rem] leading-snug tracking-[0.04em] text-[rgb(var(--color-primary))]/55 lg:inline">
              {KAZKA_HEADER_TRUST}
            </span>
          </Link>
        </div>

        <div className="site-header__center hidden min-w-0 justify-self-center sm:flex">
          <nav className="site-header__nav" aria-label="Nawigacja kolekcji">
            <ul className="site-header__nav-list flex items-center justify-center">
              <li className="site-header__nav-item">
                <NavLink
                  to="/collections"
                  prefetch="intent"
                  className={collectionNavLinkClass}
                >
                  {KAZKA_COLLECTION_NAV_LABEL}
                </NavLink>
              </li>
            </ul>
          </nav>
        </div>

        <div className="site-header__right flex shrink-0 items-center justify-end gap-x-2 sm:gap-x-3 md:gap-x-4">
          <NavLink
            to="/collections"
            prefetch="intent"
            className={`${NAV_LINK} sm:hidden`}
          >
            {KAZKA_COLLECTION_NAV_LABEL}
          </NavLink>
          <a
            href={EPIR_GOLD_COLLECTION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={headerCtaClass}
            aria-label={`${EPIR_GOLD_HEADER_CTA} — kolekcja złota EPIR Art Jewellery w nowej karcie`}
          >
            {EPIR_GOLD_HEADER_CTA}
            <span aria-hidden>→</span>
          </a>
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
