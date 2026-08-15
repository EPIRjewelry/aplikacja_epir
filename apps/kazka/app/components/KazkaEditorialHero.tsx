import {useCallback, useEffect, useState} from 'react';
import {KAZKA_HERO_SLIDES} from '~/lib/kazka-editorial-assets';

const INTERVAL_MS = 6000;

export function KazkaEditorialHero() {
  const [index, setIndex] = useState(0);
  const count = KAZKA_HERO_SLIDES.length;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count]);

  const slide = KAZKA_HERO_SLIDES[index];

  return (
    <section
      className="kazka-editorial-bleed relative w-full overflow-hidden bg-[#2c3238]"
      aria-label="Kazka — kolekcja"
    >
      <div className="relative aspect-[3/4] w-full md:aspect-[16/10] lg:aspect-[21/9]">
        {KAZKA_HERO_SLIDES.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
            alt={s.alt}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              i === index ? 'opacity-100' : 'opacity-0'
            }`}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={i === 0 ? 'high' : 'auto'}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-14 text-white">
          <p className="kazka-editorial-label mb-2 text-white/80">EPIR Art Jewellery</p>
          <h1 className="max-w-xl text-3xl font-light leading-tight tracking-tight md:text-4xl lg:text-5xl">
            Kazka
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/85 md:text-base">
            Biżuteria tworzona w polskiej pracowni — diamenty, złoto i ręczne rzemiosło.
          </p>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex gap-2 md:bottom-8 md:right-8">
        <button
          type="button"
          className="rounded-full border border-white/40 bg-black/20 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/40"
          aria-label="Poprzedni slajd"
          onClick={() => goTo(index - 1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="rounded-full border border-white/40 bg-black/20 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/40"
          aria-label="Następny slajd"
          onClick={() => goTo(index + 1)}
        >
          ›
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 md:bottom-6">
        {KAZKA_HERO_SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            aria-label={`Slajd ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
            }`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <span className="sr-only">{slide.alt}</span>
    </section>
  );
}
