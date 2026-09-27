import type {AboutProofCard} from '~/lib/kazka-brand-copy';

type KazkaAboutGemologySectionProps = {
  headline: string;
  description: string;
  stats: {label: string; value: string}[];
  heroImageSrc: string;
  heroImageAlt: string;
  cards: AboutProofCard[];
  instagram: {href: string; label: string};
};

export function KazkaAboutGemologySection({
  headline,
  description,
  stats,
  heroImageSrc,
  heroImageAlt,
  cards,
  instagram,
}: KazkaAboutGemologySectionProps) {
  const hasStats = stats.length > 0;

  return (
    <section
      aria-labelledby="kazka-gemology-heading"
      className="w-full border-t border-[rgb(var(--color-primary))]/10 px-4 py-16 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          id="kazka-gemology-heading"
          className="font-serif mb-6 text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-3xl"
        >
          {headline}
        </h2>
        <p className="font-sans leading-relaxed text-[rgb(var(--color-primary))]/75">
          {description}
        </p>
      </div>

      {hasStats ? (
        <ul className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
          {stats.map((stat) => (
            <li key={`${stat.label}-${stat.value}`} className="text-center">
              <p className="font-serif text-lg font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-xl">
                {stat.value}
              </p>
              <p className="mt-2 font-sans text-xs uppercase tracking-wider text-[rgb(var(--color-primary))]/50">
                {stat.label}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mx-auto mt-12 max-w-6xl overflow-hidden">
        <img
          src={heroImageSrc}
          alt={heroImageAlt}
          className="aspect-[16/9] w-full object-cover md:aspect-[21/9]"
          loading="lazy"
          decoding="async"
        />
      </div>

      <ul className="mx-auto mt-10 grid max-w-6xl gap-8 md:grid-cols-2 md:gap-10">
        {cards.map((card) => (
          <li key={card.id}>
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-[rgb(var(--color-primary))]/5">
              {card.videoSrc ? (
                <video
                  className="h-full w-full object-cover"
                  src={card.videoSrc}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={card.imageAlt}
                />
              ) : (
                <img
                  src={card.imageSrc}
                  alt={card.imageAlt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              )}
            </div>
            <p className="mt-4 font-sans text-sm leading-relaxed text-[rgb(var(--color-primary))]/80 md:text-base">
              {card.caption}
            </p>
          </li>
        ))}
      </ul>

      <p className="mx-auto mt-10 max-w-6xl text-center">
        <a
          href={instagram.href}
          target="_blank"
          rel="noopener noreferrer"
          className="kazka-editorial-label inline-block text-[rgb(var(--color-primary))] no-underline transition-colors hover:text-[rgb(var(--color-accent))]"
        >
          {instagram.label}
        </a>
      </p>
    </section>
  );
}
