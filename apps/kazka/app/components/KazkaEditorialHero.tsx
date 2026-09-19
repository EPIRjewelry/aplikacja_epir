import {Link} from '@remix-run/react';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {CmsHeroSlide} from '~/lib/kazka-cms-hero';
import {KAZKA_HERO_SLIDES} from '~/lib/kazka-editorial-assets';

const INTERVAL_MS = 6000;

type HeroSlide = CmsHeroSlide | {id: string; kind: 'image'; src: string; alt: string};

function pickMp4Source(
  sources: Array<{mimeType?: string; url?: string}> | undefined,
): string | undefined {
  if (!sources?.length) return undefined;
  const mp4 = sources.find((s) => s.mimeType?.includes('mp4') && s.url);
  return mp4?.url ?? sources.find((s) => s.url)?.url;
}

function toFallbackSlides(): HeroSlide[] {
  return KAZKA_HERO_SLIDES.map((slide) => ({
    id: slide.src,
    kind: 'image' as const,
    src: slide.src,
    alt: slide.alt,
  }));
}

export function KazkaEditorialHero({slides: cmsSlides}: {slides: CmsHeroSlide[]}) {
  const slides: HeroSlide[] = cmsSlides.length > 0 ? cmsSlides : toFallbackSlides();
  const [index, setIndex] = useState(0);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const count = slides.length;
  const showControls = count > 1;

  const goTo = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  useEffect(() => {
    if (!showControls) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, showControls]);

  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === index) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [index, slides]);

  const slide = slides[index] ?? slides[0];
  if (!slide) return null;

  const heading = 'heading' in slide ? slide.heading : undefined;
  const subheading = 'subheading' in slide ? slide.subheading : undefined;
  const ctaHref = 'ctaHref' in slide ? slide.ctaHref : undefined;
  const ctaText = 'ctaText' in slide ? slide.ctaText : undefined;
  const ctaTarget = 'ctaTarget' in slide ? slide.ctaTarget : undefined;
  const openInNewTab = ctaTarget === '_blank';

  return (
    <section
      className="kazka-home-hero relative w-full overflow-hidden bg-[#2c3238]"
      aria-label="Kazka — kolekcja"
    >
      {slides.map((s, i) => {
        const isActive = i === index;

        if (s.kind === 'video') {
          const videoSrc = pickMp4Source(
            'videoSources' in s ? s.videoSources : undefined,
          );

          return (
            <div
              key={s.id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {videoSrc ? (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className="h-full w-full object-cover"
                  src={videoSrc}
                  poster={s.src !== videoSrc ? s.src : undefined}
                  muted
                  loop
                  playsInline
                  preload={i === 0 ? 'auto' : 'metadata'}
                />
              ) : (
                <img
                  src={s.src}
                  alt={s.alt}
                  className="h-full w-full object-cover"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchpriority={i === 0 ? 'high' : 'auto'}
                />
              )}
            </div>
          );
        }

        return (
          <img
            key={s.id}
            src={s.src}
            alt={s.alt}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            fetchpriority={i === 0 ? 'high' : 'auto'}
          />
        );
      })}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/5" />

      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 lg:p-12">
        {heading ? (
          <h1 className="font-serif text-2xl uppercase tracking-[0.08em] text-white md:text-4xl">
            {heading}
          </h1>
        ) : (
          <>
            <p className="kazka-editorial-label mb-1 text-white/90">Kazka Jewelry</p>
            <h1 className="font-serif text-2xl uppercase tracking-[0.08em] text-white md:text-4xl">
              Kolekcja
            </h1>
          </>
        )}
        {subheading ? (
          <p className="mt-2 max-w-[45ch] font-sans text-xs font-medium leading-relaxed text-white">
            {subheading}
          </p>
        ) : null}
        {ctaHref ? (
          <div className="pointer-events-auto mt-4">
            {openInNewTab ? (
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="kazka-editorial-cta inline-block border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              >
                {ctaText ?? 'Zobacz kolekcję'}
              </a>
            ) : (
              <Link
                to={ctaHref}
                className="kazka-editorial-cta inline-block border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20"
              >
                {ctaText ?? 'Zobacz kolekcję'}
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {showControls ? (
        <>
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
            {slides.map((s, i) => (
              <button
                key={s.id}
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
        </>
      ) : null}

      <span className="sr-only">{slide.alt}</span>
    </section>
  );
}
