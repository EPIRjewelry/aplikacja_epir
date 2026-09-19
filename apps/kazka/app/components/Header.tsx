import {useEffect, useId, useState} from 'react';
import {Link, NavLink, useLocation} from '@remix-run/react';
import {
  EPIR_GOLD_COLLECTION_URL,
  EPIR_GOLD_HEADER_CTA,
  EPIR_HEADER_LOGO_ALT,
  EPIR_HEADER_LOGO_URL,
  KAZKA_CATEGORY_NAV,
  KAZKA_HEADER_EMAIL,
  KAZKA_HEADER_PHONE,
  KAZKA_HEADER_PHONE_TEL,
  KAZKA_HEADER_PRESENTS,
  KAZKA_HEADER_WHATSAPP_URL,
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
  'site-header__nav-link font-sans text-[12px] uppercase tracking-[0.12em] font-medium shrink-0 snap-start text-[rgb(var(--color-primary))] no-underline transition-[color,opacity] duration-150 ease-out hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

function categoryNavLinkClass({isActive}: {isActive: boolean}) {
  return [
    NAV_LINK,
    isActive
      ? 'text-[rgb(var(--color-accent))]'
      : 'text-[rgb(var(--color-primary))]/80',
  ]
    .filter(Boolean)
    .join(' ');
}

const iconBtnClass =
  'site-header__icon-btn inline-flex cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent p-[0.4rem] text-[rgb(var(--color-primary))] transition-[color,background-color,border-color] duration-150 ease-out hover:bg-[rgba(10,22,40,0.05)] hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 active:text-[rgb(var(--color-accent))]';

const headerCtaClass =
  'site-header__cta font-sans text-[11px] uppercase tracking-[0.15em] font-medium hidden items-center gap-1 whitespace-nowrap border border-[rgb(var(--color-accent))]/45 px-3 py-2 text-[rgb(var(--color-primary))] no-underline transition-[border-color,color,background-color] duration-150 ease-out hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 md:inline-flex';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const {pathname} = useLocation();
  const menuId = useId();

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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const itemCount = cartQuantity ?? 0;

  return (
    <header
      role="banner"
      className="site-header sticky top-0 z-50 flex h-[var(--height-nav)] w-full items-center px-4 leading-none transition-[box-shadow] duration-200 ease-out data-[scrolled=true]:shadow-[0_2px_12px_rgba(201,169,110,0.18)] sm:px-6 md:px-8 lg:px-12"
      {...(isScrolled ? {'data-scrolled': 'true'} : {})}
    >
      <div className="site-header__inner grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-4 md:gap-6">
        <div className="site-header__left flex min-w-0 items-center gap-2 justify-self-start sm:gap-3">
          <button
            type="button"
            className={`${iconBtnClass} shrink-0 self-center md:hidden`}
            aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="site-header__menu-icon" aria-hidden>
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </button>

          <div className="site-header__brand-column min-w-0">
            <div className="site-header__contact">
              <a href={`tel:${KAZKA_HEADER_PHONE_TEL}`}>
                tel/WhatsApp {KAZKA_HEADER_PHONE}
              </a>
              <span className="site-header__contact-sep" aria-hidden>·</span>
              <a href={KAZKA_HEADER_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <span className="site-header__contact-sep" aria-hidden>·</span>
              <a href={`mailto:${KAZKA_HEADER_EMAIL}`}>{KAZKA_HEADER_EMAIL}</a>
            </div>

            <Link
              to="/"
              className="site-header__brand group inline-flex max-w-full items-center gap-2 rounded-sm no-underline transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 sm:gap-3"
              aria-label={`Przejdź do strony głównej ${brandName}`}
            >
              <img
                src={EPIR_HEADER_LOGO_URL}
                alt={EPIR_HEADER_LOGO_ALT}
                className="site-header__logo-img h-11 w-auto object-contain md:h-[4.5rem]"
                width={250}
                height={250}
                decoding="async"
              />
              <span className="site-header__presents">{KAZKA_HEADER_PRESENTS}</span>
            </Link>
          </div>
        </div>

        <div className="site-header__center hidden min-w-0 justify-self-center overflow-hidden md:block">
          <nav className="site-header__nav" aria-label="Kategorie biżuterii">
            <ul className="flex max-w-full items-center justify-center gap-x-5 lg:gap-x-6">
              {KAZKA_CATEGORY_NAV.map(({handle, label, path}) => {
                const isActive = pathname.includes(handle);
                return (
                  <li key={handle} className="site-header__nav-item shrink-0">
                    <NavLink
                      to={path}
                      prefetch="intent"
                      className={() => categoryNavLinkClass({isActive})}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="site-header__right flex shrink-0 items-center justify-end gap-x-1 sm:gap-x-3 md:gap-x-4">
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
            aria-label={
              itemCount > 0 ? `Otwórz koszyk (${itemCount})` : 'Otwórz koszyk'
            }
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

      {menuOpen ? (
        <div className="site-header__mobile-layer md:hidden" id={menuId}>
          <button
            type="button"
            className="site-header__mobile-backdrop"
            aria-label="Zamknij menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="site-header__mobile-drawer"
            aria-label="Menu kategorii"
          >
            <ul className="flex flex-col gap-1 px-2 py-4">
              {KAZKA_CATEGORY_NAV.map(({handle, label, path}) => {
                const isActive = pathname.includes(handle);
                return (
                  <li key={handle}>
                    <NavLink
                      to={path}
                      prefetch="intent"
                      className={() =>
                        [
                          'block px-4 py-3 font-sans text-[12px] uppercase tracking-[0.12em] font-medium text-[rgb(var(--color-primary))] no-underline transition-colors',
                          isActive
                            ? 'text-[rgb(var(--color-accent))]'
                            : 'hover:text-[rgb(var(--color-accent))]',
                        ].join(' ')
                      }
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                    >
                      {label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-[rgb(var(--color-accent))]/30 px-6 py-4">
              <a
                href={EPIR_GOLD_COLLECTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="kazka-editorial-label inline-flex items-center gap-1 text-[rgb(var(--color-primary))] no-underline"
                onClick={() => setMenuOpen(false)}
              >
                {EPIR_GOLD_HEADER_CTA}
                <span aria-hidden>→</span>
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
