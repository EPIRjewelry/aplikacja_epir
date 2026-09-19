import {KAZKA_EDITORIAL_COLLECTION_VIDEO} from '~/lib/kazka-editorial-assets';

/** Full-bleed editorial video — matches local Copilot layout (edge-to-edge, no framed box). */
export function KazkaEditorialVideoSection() {
  return (
    <section className="w-full bg-[#f4efe8] py-6 md:py-8">
      <div className="mb-3 px-4 md:mb-4 md:px-6">
        <p className="kazka-editorial-label text-[rgb(var(--color-primary))]/80">
          KAZKA
        </p>
      </div>
      <div className="w-full overflow-hidden bg-[#f1ece6]">
        <div className="kazka-home-video">
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
