import {Link, useSearchParams} from '@remix-run/react';
import {
  activeKatLabel,
  activeLiniaLabel,
  buildClearKatParams,
  buildClearLiniaParams,
  buildClearNavParams,
} from '~/lib/kazka-collection-nav';

type KazkaEmptyCollectionStateProps = {
  hasLiniaFilter: boolean;
  hasKatFilter: boolean;
  hasOtherFilters: boolean;
};

export function KazkaEmptyCollectionState({
  hasLiniaFilter,
  hasKatFilter,
  hasOtherFilters,
}: KazkaEmptyCollectionStateProps) {
  const [searchParams] = useSearchParams();
  const linia = searchParams.get('linia') ?? '';
  const kat = searchParams.get('kat') ?? '';
  const liniaLabel = activeLiniaLabel(linia);
  const katLabel = activeKatLabel(kat);

  let message =
    'Brak produktów w tej kolekcji. Upewnij się, że produkty są opublikowane w kanale Kazka.';

  if (hasLiniaFilter && hasKatFilter) {
    message = `Brak produktów w kombinacji ${liniaLabel ?? 'linia'} i ${katLabel ?? 'typ'}. Spróbuj usunąć typ biżuterii lub zmienić linię.`;
  } else if (hasLiniaFilter) {
    message = `Brak produktów w linii ${liniaLabel ?? 'wybranej'}. Zobacz całą kolekcję.`;
  } else if (hasKatFilter) {
    message = `Brak produktów w kategorii ${katLabel ?? 'wybranej'}. Zobacz wszystkie typy.`;
  } else if (hasOtherFilters) {
    message =
      'Brak produktów dla wybranych filtrów. Zmień kryteria lub wyczyść filtry.';
  }

  const clearKatHref = `?${buildClearKatParams(searchParams)}`;
  const clearLiniaHref = `?${buildClearLiniaParams(searchParams)}`;
  const clearAllNavHref = `?${buildClearNavParams(searchParams)}`;

  return (
    <div className="grid gap-4 py-12 text-[rgb(var(--color-primary))]/70">
      <p>{message}</p>
      <div className="flex flex-wrap gap-3">
        {hasKatFilter ? (
          <Link
            to={clearKatHref}
            preventScrollReset
            className="kazka-editorial-label border border-[rgb(var(--color-primary))]/20 px-3 py-2 text-[rgb(var(--color-primary))] hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))]"
          >
            Usuń typ
          </Link>
        ) : null}
        {hasLiniaFilter ? (
          <Link
            to={clearLiniaHref}
            preventScrollReset
            className="kazka-editorial-label border border-[rgb(var(--color-primary))]/20 px-3 py-2 text-[rgb(var(--color-primary))] hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))]"
          >
            Pokaż wszystkie linie
          </Link>
        ) : null}
        {hasLiniaFilter && hasKatFilter ? (
          <Link
            to={clearAllNavHref}
            preventScrollReset
            className="kazka-editorial-label border border-[rgb(var(--color-primary))]/20 px-3 py-2 text-[rgb(var(--color-primary))] hover:border-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-accent))]"
          >
            Pokaż wszystkie
          </Link>
        ) : null}
      </div>
    </div>
  );
}
