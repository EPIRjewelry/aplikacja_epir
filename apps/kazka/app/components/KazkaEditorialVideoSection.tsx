import {KAZKA_EDITORIAL_COLLECTION_VIDEO} from '~/lib/kazka-editorial-assets';

/** Full-bleed editorial video — matches local Copilot layout (edge-to-edge, no framed box). */
export function KazkaEditorialVideoSection() {
  return (
    <section className="w-full bg-[#f4efe8] py-8 md:py-12">
      <div className="mb-4 px-4 md:px-6">
        <p className="kazka-editorial-label text-[10px] tracking-[0.28em] text-[rgb(var(--color-primary))]/70">
          KAZKA
        </p>
      </div>
      <div className="kazka-editorial-bleed w-full overflow-hidden bg-[#f1ece6]">
        <div className="relative aspect-video w-full min-h-[50vh] md:min-h-0">
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
    </section>
  );
}
