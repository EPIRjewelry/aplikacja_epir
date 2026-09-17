import {Link} from '@remix-run/react';
import {KAZKA_EDITORIAL_LINES} from '~/lib/kazka-editorial-assets';

/**
 * Home — curated lines (Classic / Big Lab / Fancy Cut).
 * Editorial discovery before featured products; not a filter bar.
 */
export function KazkaEditorialLines() {
  return (
    <section
      className="w-full bg-[#f1ece6] py-8 md:py-12"
      aria-labelledby="kazka-lines-heading"
    >
      <h2
        id="kazka-lines-heading"
        className="kazka-editorial-label mb-2 text-center text-[#2c3238]"
      >
        Linie
      </h2>
      <p className="mx-auto mb-8 max-w-md px-4 text-center text-xs leading-relaxed text-[#2c3238]/70 md:mb-10">
        Trzy koncepty w złocie i brylancie — ten sam spokój formy, różny wybór
        kamienia i szlifu.
      </p>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:grid-cols-3 sm:gap-4 md:gap-6 md:px-6">
        {KAZKA_EDITORIAL_LINES.map((line) => (
          <Link
            key={line.href}
            to={line.href}
            className="group flex flex-col no-underline"
            prefetch="intent"
          >
            <div className="kazka-line-tile relative overflow-hidden bg-[#f2f2f2]">
              <img
                src={line.image}
                alt={line.alt}
                className="kazka-category-tile-hover h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                loading="lazy"
                decoding="async"
              />
            </div>
            <span className="kazka-editorial-label mt-4 text-[#2c3238]">
              {line.label}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-[#2c3238]/70">
              {line.body}
            </p>
            <span className="kazka-editorial-label mt-3 text-[0.65rem] tracking-[0.14em] text-[#2c3238]/55 transition-colors duration-150 group-hover:text-[rgb(var(--color-accent))]">
              Zobacz →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
