/**
 * Brand storytelling — selekcja diamentów / gemmologia.
 *
 * CMS-ready (przyszły metaobiekt `gemology_section`):
 *   headline → headline
 *   description → description
 *   stats (list / JSON) → stats[]
 */
export interface GemologySectionProps {
  headline: string;
  description: string;
  stats?: {label: string; value: string}[];
}

export function GemologySection({
  headline,
  description,
  stats,
}: GemologySectionProps) {
  const hasStats = Array.isArray(stats) && stats.length > 0;

  return (
    <section
      aria-labelledby="gemology-section-heading"
      className="font-body w-full border-t border-[rgb(var(--color-primary))]/10 px-4 py-16 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          id="gemology-section-heading"
          className="font-heading mb-6 text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-3xl"
        >
          {headline}
        </h2>
        <p className="text-[rgb(var(--color-primary))]/75 leading-relaxed">
          {description}
        </p>
      </div>

      {hasStats ? (
        <ul className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          {stats.map((stat) => (
            <li
              key={`${stat.label}-${stat.value}`}
              className="text-center"
            >
              <p className="font-heading text-lg font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-xl">
                {stat.value}
              </p>
              <p className="mt-2 text-xs uppercase tracking-wider text-[rgb(var(--color-primary))]/50">
                {stat.label}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
