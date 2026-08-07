import {Form, Link, useSearchParams} from '@remix-run/react';

export type CollectionFilterOption = {
  value: string;
  label: string;
};

export type CollectionFiltersProps = {
  metalOptions?: readonly CollectionFilterOption[];
  probaOptions?: readonly CollectionFilterOption[];
  shapeOptions?: readonly CollectionFilterOption[];
  weightOptions?: readonly CollectionFilterOption[];
  qualityOptions?: readonly CollectionFilterOption[];
  typeOptions?: readonly CollectionFilterOption[];
  sortOptions?: readonly CollectionFilterOption[];
  className?: string;
};

const DEFAULT_METAL: CollectionFilterOption[] = [
  {value: 'zloto-zolte', label: 'Złoto żółte'},
  {value: 'zloto-biale', label: 'Złoto białe'},
  {value: 'zloto-rozowe', label: 'Złoto różowe'},
];

const DEFAULT_PROBA: CollectionFilterOption[] = [
  {value: '14', label: '14 karatów'},
  {value: '18', label: '18 karatów'},
];

const DEFAULT_SHAPE: CollectionFilterOption[] = [
  {value: 'Okrągły', label: 'Okrągły'},
  {value: 'Księżniczka', label: 'Księżniczka'},
  {value: 'Markiza', label: 'Markiza'},
  {value: 'Bagietka', label: 'Bagietka'},
  {value: 'Serce', label: 'Serce'},
  {value: 'Gruszka', label: 'Gruszka'},
  {value: 'Owalny', label: 'Owalny'},
];

const DEFAULT_WEIGHT: CollectionFilterOption[] = [
  {value: '0-0.2', label: 'do 0,2 ct'},
  {value: '0.2-0.5', label: '0,2–0,5 ct'},
  {value: '0.5+', label: '0,5 ct i więcej'},
];

const DEFAULT_QUALITY: CollectionFilterOption[] = [
  {value: 'D/VVS2', label: 'D/VVS2'},
  {value: 'F/VS2', label: 'F/VS2'},
  {value: 'G/VS2', label: 'G/VS2'},
  {value: 'G/SI', label: 'G/SI'},
  {value: 'LAB', label: 'Laboratoryjny'},
];

const DEFAULT_TYPE: CollectionFilterOption[] = [
  {value: 'Pierścionek', label: 'Pierścionek'},
  {value: 'Naszyjnik', label: 'Naszyjnik'},
  {value: 'Kolczyki', label: 'Kolczyki'},
  {value: 'Bransoletka', label: 'Bransoletka'},
];

const DEFAULT_SORT: CollectionFilterOption[] = [
  {value: '', label: 'Domyślne'},
  {value: 'price_asc', label: 'Cena: rosnąco'},
  {value: 'price_desc', label: 'Cena: malejąco'},
  {value: 'newest', label: 'Najnowsze'},
];

function selectedValues(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Formularz GET — aktualizuje tylko query params (zachowuje spójność z Hydrogen Pagination).
 * Nie wysyła `cursor` / `direction`, więc zmiana filtrów wraca na pierwszą stronę.
 *
 * Osie Kazka: metal + próba | kształt + waga | jakość + typ | cena + sort.
 */
export function CollectionFilters({
  metalOptions = DEFAULT_METAL,
  probaOptions = DEFAULT_PROBA,
  shapeOptions = DEFAULT_SHAPE,
  weightOptions = DEFAULT_WEIGHT,
  qualityOptions = DEFAULT_QUALITY,
  typeOptions = DEFAULT_TYPE,
  sortOptions = DEFAULT_SORT,
  className = '',
}: CollectionFiltersProps) {
  const [searchParams] = useSearchParams();
  const selectedMetal = selectedValues(searchParams, 'metal');
  const selectedProba = selectedValues(searchParams, 'proba');
  const selectedShape = searchParams.get('ksztalt') ?? '';
  const selectedWeight = searchParams.get('waga') ?? '';
  const selectedQuality = searchParams.get('jakosc') ?? '';
  const selectedType = searchParams.get('type') ?? '';
  const priceMin = searchParams.get('price_min') ?? '';
  const priceMax = searchParams.get('price_max') ?? '';
  const sort = searchParams.get('sort') ?? '';
  const hasActive =
    selectedMetal.length > 0 ||
    selectedProba.length > 0 ||
    Boolean(selectedShape) ||
    Boolean(selectedWeight) ||
    Boolean(selectedQuality) ||
    Boolean(selectedType) ||
    Boolean(priceMin) ||
    Boolean(priceMax) ||
    Boolean(sort);

  const fieldClass =
    'rounded-md border border-black/15 bg-[rgb(var(--color-contrast))] px-2 py-1.5 text-sm text-[rgb(var(--color-primary))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';
  const legendClass =
    'text-xs font-medium uppercase tracking-wide text-[rgb(var(--color-primary))]/60 mb-2';
  const labelClass =
    'flex items-center gap-2 text-sm text-[rgb(var(--color-primary))] cursor-pointer';

  return (
    <Form
      method="get"
      replace
      className={`grid gap-4 border-y border-black/10 py-4 ${className}`.trim()}
      aria-label="Filtry kolekcji"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-4 content-start">
          <fieldset>
            <legend className={legendClass}>Metal</legend>
            <div className="grid gap-2">
              {metalOptions.map((opt) => (
                <label key={opt.value} className={labelClass}>
                  <input
                    type="checkbox"
                    name="metal"
                    value={opt.value}
                    defaultChecked={selectedMetal.includes(opt.value)}
                    className="accent-[rgb(var(--color-primary))]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className={legendClass}>Próba</legend>
            <div className="grid gap-2">
              {probaOptions.map((opt) => (
                <label key={opt.value} className={labelClass}>
                  <input
                    type="checkbox"
                    name="proba"
                    value={opt.value}
                    defaultChecked={selectedProba.includes(opt.value)}
                    className="accent-[rgb(var(--color-primary))]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="grid gap-3 content-start">
          <div>
            <label className={legendClass} htmlFor="collection-shape">
              Kształt
            </label>
            <select
              id="collection-shape"
              name="ksztalt"
              defaultValue={selectedShape}
              className={`w-full ${fieldClass}`}
            >
              <option value="">Wszystkie</option>
              {shapeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={legendClass} htmlFor="collection-weight">
              Waga kamienia
            </label>
            <select
              id="collection-weight"
              name="waga"
              defaultValue={selectedWeight}
              className={`w-full ${fieldClass}`}
            >
              <option value="">Wszystkie</option>
              {weightOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 content-start">
          <div>
            <label className={legendClass} htmlFor="collection-quality">
              Jakość
            </label>
            <select
              id="collection-quality"
              name="jakosc"
              defaultValue={selectedQuality}
              className={`w-full ${fieldClass}`}
            >
              <option value="">Wszystkie</option>
              {qualityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={legendClass} htmlFor="collection-type">
              Typ
            </label>
            <select
              id="collection-type"
              name="type"
              defaultValue={selectedType}
              className={`w-full ${fieldClass}`}
            >
              <option value="">Wszystkie</option>
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset className="grid gap-3 content-start">
          <legend className={legendClass}>Cena (PLN)</legend>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="collection-price-min">
              Cena od
            </label>
            <input
              id="collection-price-min"
              name="price_min"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder="Od"
              defaultValue={priceMin}
              className={`w-24 ${fieldClass}`}
            />
            <span className="text-[rgb(var(--color-primary))]/40" aria-hidden>
              –
            </span>
            <label className="sr-only" htmlFor="collection-price-max">
              Cena do
            </label>
            <input
              id="collection-price-max"
              name="price_max"
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              placeholder="Do"
              defaultValue={priceMax}
              className={`w-24 ${fieldClass}`}
            />
          </div>
          <div>
            <label className={legendClass} htmlFor="collection-sort">
              Sortowanie
            </label>
            <select
              id="collection-sort"
              name="sort"
              defaultValue={sort}
              className={`w-full ${fieldClass}`}
            >
              {sortOptions.map((opt) => (
                <option key={opt.value || 'default'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="rounded-md bg-[rgb(var(--color-primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--color-contrast))] transition-colors hover:bg-[rgb(var(--color-primary))]/90"
            >
              Zastosuj
            </button>
            {hasActive ? (
              <Link
                to="."
                preventScrollReset
                className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium text-[rgb(var(--color-primary))] hover:bg-black/5"
              >
                Wyczyść
              </Link>
            ) : null}
          </div>
        </fieldset>
      </div>
    </Form>
  );
}
