import {Link, useLocation} from '@remix-run/react';
import {LINIA_NAV_OPTIONS} from '~/lib/collection-product-filters';
import {
  activeLiniaFromPath,
  buildLiniaHref,
} from '~/lib/kazka-collection-nav';

function navTabClass(isActive: boolean): string {
  return [
    'font-sans text-[12px] uppercase tracking-[0.12em] font-medium shrink-0 snap-start border-b-2 px-3 py-3 transition-colors duration-150',
    isActive
      ? 'border-[rgb(var(--color-accent))] text-[rgb(var(--color-primary))]'
      : 'border-transparent text-[rgb(var(--color-primary))]/80 hover:text-[rgb(var(--color-primary))]',
  ].join(' ');
}

export function KazkaCollectionNav() {
  const {pathname} = useLocation();
  const activeLinia = activeLiniaFromPath(pathname);

  return (
    <nav
      aria-label="Linia kolekcji"
      className="site-header__linia-nav -mx-6 border-b border-[rgb(var(--color-primary))]/10 px-6 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12"
    >
      <div className="hiddenScroll flex overflow-x-auto snap-x snap-mandatory">
        {LINIA_NAV_OPTIONS.map(({value, label}) => {
          const isActive = activeLinia === value;
          const href = buildLiniaHref(value);

          return (
            <Link
              key={value || 'all'}
              to={href}
              prefetch="intent"
              className={navTabClass(isActive)}
              aria-current={isActive ? 'page' : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
