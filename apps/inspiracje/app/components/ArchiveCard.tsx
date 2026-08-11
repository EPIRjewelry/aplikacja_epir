import {Link} from '@remix-run/react';
import type {ArchiveItem} from '~/lib/archive';
import {plainTextFromHtml} from '~/lib/archive';

export type ArchiveCardProps = {
  item: ArchiveItem;
  index?: number;
};

export function ArchiveCard({item, index = 0}: ArchiveCardProps) {
  const img = item.featuredImage || item.images[0];
  const excerpt = plainTextFromHtml(item.descriptionHtml, 110);

  return (
    <article
      className="group animate-fade-in-up"
      style={{animationDelay: `${Math.min(index, 12) * 40}ms`}}
    >
      <Link
        to={`/inspiracje/${item.handle}`}
        prefetch="intent"
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-4"
      >
        <div className="relative aspect-square overflow-hidden bg-[#e8e4da]">
          {img?.url ? (
            <img
              src={img.url}
              alt={img.altText || item.title}
              width={img.width ?? 800}
              height={img.height ?? 800}
              loading={index < 6 ? 'eager' : 'lazy'}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-epir-muted">
              Brak zdjęcia
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1.5">
          <h2 className="text-lg font-semibold leading-snug text-epir-ink transition-colors group-hover:text-epir-accent md:text-xl">
            {item.title}
          </h2>
          {item.productType ? (
            <p className="text-xs uppercase tracking-wider text-epir-muted">
              {item.productType}
            </p>
          ) : null}
          {excerpt ? (
            <p className="text-sm leading-relaxed text-epir-muted line-clamp-2">
              {excerpt}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
