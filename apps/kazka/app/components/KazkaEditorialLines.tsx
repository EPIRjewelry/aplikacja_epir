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
        className="kazka-section-heading mb-3 text-center"
      >
        Linie
      </h2>
      <p className="kazka-section-lead mx-auto mb-8 max-w-xl px-4 text-center md:mb-10">
        Cztery linie w złocie — brylant, szlif i kamień kolorowy w tej samej
        geometrii formy.
      </p>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 md:gap-6 md:px-6">
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
              <span className="kazka-odkryj-label absolute bottom-4 left-4">
                {line.label}
              </span>
            </div>
            <p className="mt-2 font-sans text-xs leading-relaxed text-[#2c3238]/80">
              {line.body}
            </p>
            <span className="kazka-editorial-label mt-3 text-[rgb(var(--color-primary))]/80 transition-colors duration-150 group-hover:text-[rgb(var(--color-accent))]">
              Zobacz →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
