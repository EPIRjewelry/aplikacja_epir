import type {AboutProofCard} from '~/lib/kazka-brand-copy';

export function KazkaAboutProductionCards({cards}: {cards: AboutProofCard[]}) {
  if (!cards.length) return null;

  return (
    <section
      aria-labelledby="kazka-production-cards-heading"
      className="w-full px-4 pb-8 md:px-8 md:pb-12"
    >
      <div className="mx-auto max-w-6xl">
        <h2 id="kazka-production-cards-heading" className="sr-only">
          Pracownia — dowód wizualny
        </h2>
        <ul className="grid gap-8 md:grid-cols-2 md:gap-10">
          {cards.map((card) => (
            <li key={card.id}>
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-[rgb(var(--color-primary))]/5">
                <img
                  src={card.imageSrc}
                  alt={card.imageAlt}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <p className="mt-4 font-sans text-sm leading-relaxed text-[rgb(var(--color-primary))]/80 md:text-base">
                {card.caption}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
