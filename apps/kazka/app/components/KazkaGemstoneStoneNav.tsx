import {Link, useLocation} from '@remix-run/react';
import {
  GEMSTONE_LINE_HANDLE,
  GEMSTONE_STONE_TILES,
  isGemstoneCollectionHandle,
} from '~/lib/kazka-gemstone-collections';

function stoneTabClass(isActive: boolean): string {
  return [
    'font-sans text-[11px] uppercase tracking-[0.1em] font-medium shrink-0 snap-start border-b-2 px-3 py-2 transition-colors duration-150',
    isActive
      ? 'border-[rgb(var(--color-accent))] text-[rgb(var(--color-primary))]'
      : 'border-transparent text-[rgb(var(--color-primary))]/75 hover:text-[rgb(var(--color-primary))]',
  ].join(' ');
}

/** Drugi poziom nawigacji — szafir / rubin / szmaragd na kolekcjach gemstone. */
export function KazkaGemstoneStoneNav({collectionHandle}: {collectionHandle: string}) {
  const {pathname} = useLocation();

  if (!isGemstoneCollectionHandle(collectionHandle)) {
    return null;
  }

  const hubHref = `/collections/${GEMSTONE_LINE_HANDLE}`;
  const isHub = collectionHandle === GEMSTONE_LINE_HANDLE;

  return (
    <nav
      aria-label="Kamień główny"
      className="border-b border-[rgb(var(--color-primary))]/10 pb-2"
    >
      <div className="hiddenScroll flex gap-1 overflow-x-auto snap-x snap-mandatory">
        <Link
          to={hubHref}
          prefetch="intent"
          className={stoneTabClass(isHub)}
          aria-current={isHub ? 'page' : undefined}
        >
          Wszystkie
        </Link>
        {GEMSTONE_STONE_TILES.map((tile) => {
          const isActive = pathname.includes(tile.handle);
          return (
            <Link
              key={tile.handle}
              to={tile.href}
              prefetch="intent"
              className={stoneTabClass(isActive)}
              aria-current={isActive ? 'page' : undefined}
            >
              {tile.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
