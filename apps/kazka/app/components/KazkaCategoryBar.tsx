import {Link, useSearchParams} from '@remix-run/react';
import {KAT_NAV_OPTIONS} from '~/lib/collection-product-filters';
import {buildKatParams} from '~/lib/kazka-collection-nav';

function categoryPillClass(isActive: boolean): string {
  return [
    'kazka-editorial-label shrink-0 snap-start border px-3 py-1.5 text-[0.625rem] tracking-[0.1em] transition-colors duration-150',
    isActive
      ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] text-[rgb(var(--color-contrast))]'
      : 'border-[rgb(var(--color-primary))]/20 text-[rgb(var(--color-primary))]/70 hover:border-[rgb(var(--color-primary))]/40 hover:text-[rgb(var(--color-primary))]',
  ].join(' ');
}

export function KazkaCategoryBar() {
  const [searchParams] = useSearchParams();
  const activeKat = searchParams.get('kat') ?? '';

  return (
    <div
      role="group"
      aria-label="Typ biżuterii"
      className="hiddenScroll flex gap-2 overflow-x-auto snap-x snap-mandatory py-1"
    >
      {KAT_NAV_OPTIONS.map(({value, label}) => {
        const next = buildKatParams(searchParams, value);
        const isActive = activeKat === value;
        const href = next ? `?${next}` : '.';

        return (
          <Link
            key={value || 'all-types'}
            to={href}
            preventScrollReset
            className={categoryPillClass(isActive)}
            aria-current={isActive ? 'true' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
