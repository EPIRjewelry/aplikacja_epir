/**
 * Brand storytelling — rzemiosło / manufaktura.
 *
 * CMS-ready (przyszły metaobiekt `craftsmanship_story`):
 *   title → title
 *   body (rich_text) → bodyHtml
 *   image / video (file_reference) → imageUrl / videoUrl
 */
export interface CraftsmanshipStoryProps {
  title: string;
  bodyHtml: string;
  imageUrl?: string;
  videoUrl?: string;
  imageAlt?: string;
}

export function CraftsmanshipStory({
  title,
  bodyHtml,
  imageUrl,
  videoUrl,
  imageAlt = '',
}: CraftsmanshipStoryProps) {
  const hasMedia = Boolean(videoUrl || imageUrl);

  return (
    <section
      aria-labelledby="craftsmanship-story-heading"
      className="font-body w-full px-4 py-16 md:px-8 md:py-24"
    >
      <div
        className={`mx-auto grid max-w-6xl gap-10 md:gap-16 ${
          hasMedia ? 'md:grid-cols-2 md:items-center' : ''
        }`}
      >
        <div className={hasMedia ? '' : 'mx-auto max-w-2xl text-center'}>
          <h2
            id="craftsmanship-story-heading"
            className="font-heading mb-6 text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))] md:text-3xl"
          >
            {title}
          </h2>
          <div
            className={`text-[rgb(var(--color-primary))]/75 leading-relaxed [&_a]:text-[rgb(var(--color-accent))] [&_a]:underline [&_p]:mb-4 [&_p:last-child]:mb-0 ${
              hasMedia ? 'text-left' : 'text-center'
            }`}
            dangerouslySetInnerHTML={{__html: bodyHtml}}
          />
        </div>

        {hasMedia ? (
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-[rgb(var(--color-primary))]/5">
            {videoUrl ? (
              <video
                className="h-full w-full object-cover"
                src={videoUrl}
                poster={imageUrl}
                controls
                playsInline
                preload="metadata"
              >
                <track kind="captions" />
              </video>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt={imageAlt || title}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
