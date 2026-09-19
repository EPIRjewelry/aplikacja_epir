import {Link} from '@remix-run/react';
import {KAZKA_EDITORIAL_CATEGORIES} from '~/lib/kazka-editorial-assets';

/** Category discovery tiles — 4:5 fill, 2×2, links to dedicated kazka-* collections. */
export function KazkaEditorialCategoryTiles() {
  return (
    <section className="w-full py-6 md:py-8">
      <h2 className="kazka-editorial-label mb-4 text-center md:mb-6">Odkryj</h2>
      <div className="grid w-full grid-cols-2 gap-0 px-0">
        {KAZKA_EDITORIAL_CATEGORIES.map((tile) => (
          <Link
            key={tile.href}
            to={tile.href}
            className="kazka-odkryj-tile group relative block overflow-hidden bg-[#f2f2f2]"
          >
            <img
              src={tile.image}
              alt={tile.alt}
              className="kazka-category-tile-hover h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              style={
                tile.href === '/collections/kazka-naszyjniki'
                  ? {objectPosition: 'center 65%'}
                  : undefined
              }
              loading="lazy"
              decoding="async"
            />
            <span className="kazka-odkryj-label absolute bottom-4 left-4">
              {tile.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
