import {KAZKA_EDITORIAL_COLLECTION_VIDEO} from '~/lib/kazka-editorial-assets';

export function KazkaEditorialVideoSection() {
  return (
    <section className="relative py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-6 text-center">
          <p className="kazka-editorial-label text-[11px] tracking-[0.22em] text-[rgb(var(--color-primary))]/70">
            KAZKA
          </p>
          <h2 className="mt-2 text-3xl font-medium tracking-[0.08em] text-[rgb(var(--color-primary))] md:text-5xl">
            Poznaj kolekcję
          </h2>
        </div>
        <div className="overflow-hidden rounded-[24px] border border-[#d9d0c6] bg-[#f7f1eb] shadow-[0_24px_80px_rgba(32,24,18,0.08)]">
          <div className="relative aspect-video w-full">
            <iframe
              className="absolute inset-0 h-full w-full"
              src={KAZKA_EDITORIAL_COLLECTION_VIDEO.embedSrc}
              title={KAZKA_EDITORIAL_COLLECTION_VIDEO.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
