import {Link} from '@remix-run/react';
import {KAZKA_EDITORIAL_CATEGORIES} from '~/lib/kazka-editorial-assets';

/** Category discovery tiles — 4:5 fill, 2×2, links to dedicated kazka-* collections. */
export function KazkaEditorialCategoryTiles() {
  return (
    <section className="py-10 md:py-14">
      <h2 className="kazka-editorial-label mb-6 text-center">Odkryj</h2>
      <div className="grid grid-cols-2 gap-3 px-4 md:gap-4 md:px-6">
        {KAZKA_EDITORIAL_CATEGORIES.map((tile) => (
          <Link
            key={tile.href}
            to={tile.href}
            className="group relative block aspect-[4/5] overflow-hidden bg-[#f2f2f2]"
          >
            <img
              src={tile.image}
              alt={tile.alt}
              className="kazka-category-tile-hover h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span className="kazka-editorial-label absolute bottom-4 left-4 text-white">
              {tile.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
