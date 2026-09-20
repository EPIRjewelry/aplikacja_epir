import {
  Form,
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from '@remix-run/react';
import {Drawer, useDrawer} from '../Drawer';

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

function countActiveFilterAxes(params: URLSearchParams): number {
  let count = 0;
  if (selectedValues(params, 'metal').length > 0) count += 1;
  if (selectedValues(params, 'proba').length > 0) count += 1;
  if (params.get('ksztalt')) count += 1;
  if (params.get('waga')) count += 1;
  if (params.get('jakosc')) count += 1;
  if (params.get('type')) count += 1;
  if (params.get('price_min') || params.get('price_max')) count += 1;
  if (params.get('sort')) count += 1;
  return count;
}

function IconFilter() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
      aria-hidden
    >
      <path
        d="M3 5h14M5 10h10M8 15h4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Formularz GET — aktualizuje tylko query params (zachowuje spójność z Hydrogen Pagination).
 * Pełny selektor w lewym panelu; nad siatką tylko pasek Filtry + sort.
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
  const location = useLocation();
  const navigate = useNavigate();
  const {isOpen, openDrawer, closeDrawer} = useDrawer();

  const selectedMetal = selectedValues(searchParams, 'metal');
  const selectedProba = selectedValues(searchParams, 'proba');
  const selectedShape = searchParams.get('ksztalt') ?? '';
  const selectedWeight = searchParams.get('waga') ?? '';
  const selectedQuality = searchParams.get('jakosc') ?? '';
  const selectedType = searchParams.get('type') ?? '';
  const selectedKat = searchParams.get('kat') ?? '';
  const selectedLinia = searchParams.get('linia') ?? '';
  const priceMin = searchParams.get('price_min') ?? '';
  const priceMax = searchParams.get('price_max') ?? '';
  const sort = searchParams.get('sort') ?? '';
  const activeCount = countActiveFilterAxes(searchParams);
  const hasActive = activeCount > 0;

  const fieldClass =
    'w-full rounded-md border border-black/15 bg-[rgb(var(--color-contrast))] px-2 py-1.5 font-sans text-sm text-[rgb(var(--color-primary))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';
  const priceFieldClass = `${fieldClass} tabular-nums`;
  const legendClass =
    'mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-primary))]/80';
  const labelClass =
    'flex cursor-pointer items-center gap-2 font-sans text-sm text-[rgb(var(--color-primary))]';
  const filterButtonClass =
    'rounded-md border border-black/20 px-6 py-3 font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-primary))] transition-colors hover:bg-black/5';

  function handleQuickSortChange(nextSort: string) {
    const next = new URLSearchParams(searchParams);
    if (nextSort) {
      next.set('sort', nextSort);
    } else {
      next.delete('sort');
    }
    next.delete('cursor');
    next.delete('direction');
    navigate(
      {pathname: location.pathname, search: next.toString()},
      {replace: true, preventScrollReset: true},
    );
  }

  return (
    <div className={className}>
      <div
        className="flex flex-wrap items-center gap-3 border-b border-black/10 py-3"
        role="toolbar"
        aria-label="Filtry i sortowanie kolekcji"
      >
        <button
          type="button"
          onClick={openDrawer}
          aria-expanded={isOpen}
          aria-controls="collection-filters-panel"
          className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] px-4 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-contrast))] transition-colors hover:bg-[rgb(var(--color-primary))]/90"
        >
          <IconFilter />
          Filtry
          {activeCount > 0 ? (
            <span
              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[rgb(var(--color-contrast))] px-1.5 py-0.5 font-sans text-[10px] font-semibold tabular-nums text-[rgb(var(--color-primary))]"
              aria-label={`${activeCount} aktywne filtry`}
            >
              {activeCount}
            </span>
          ) : null}
        </button>

        <label className="ml-auto flex items-center gap-2">
          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-primary))]/80">
            Sortuj
          </span>
          <select
            value={sort}
            onChange={(event) => handleQuickSortChange(event.target.value)}
            className={`${fieldClass} w-auto min-w-[10rem]`}
            aria-label="Sortowanie kolekcji"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value || 'default'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Drawer
        side="left"
        open={isOpen}
        onClose={closeDrawer}
        title="Filtry"
        panelClassName="max-w-md"
      >
        <Form
          id="collection-filters-panel"
          method="get"
          replace
          className="flex min-h-0 flex-1 flex-col"
          aria-label="Filtry kolekcji"
          onSubmit={() => closeDrawer()}
        >
          {selectedKat ? (
            <input type="hidden" name="kat" value={selectedKat} />
          ) : null}
          {selectedLinia ? (
            <input type="hidden" name="linia" value={selectedLinia} />
          ) : null}

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="grid gap-6">
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

              <fieldset className="grid gap-3">
                <div>
                  <label className={legendClass} htmlFor="collection-shape">
                    Kształt
                  </label>
                  <select
                    id="collection-shape"
                    name="ksztalt"
                    defaultValue={selectedShape}
                    className={fieldClass}
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
                    className={fieldClass}
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

              <fieldset className="grid gap-3">
                <div>
                  <label className={legendClass} htmlFor="collection-quality">
                    Jakość
                  </label>
                  <select
                    id="collection-quality"
                    name="jakosc"
                    defaultValue={selectedQuality}
                    className={fieldClass}
                  >
                    <option value="">Wszystkie</option>
                    {qualityOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {typeOptions.length > 0 ? (
                  <div>
                    <label className={legendClass} htmlFor="collection-type">
                      Typ
                    </label>
                    <select
                      id="collection-type"
                      name="type"
                      defaultValue={selectedType}
                      className={fieldClass}
                    >
                      <option value="">Wszystkie</option>
                      {typeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="grid gap-3">
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
                    className={`w-28 ${priceFieldClass}`}
                  />
                  <span
                    className="text-[rgb(var(--color-primary))]/40"
                    aria-hidden
                  >
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
                    className={`w-28 ${priceFieldClass}`}
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
                    className={fieldClass}
                  >
                    {sortOptions.map((opt) => (
                      <option key={opt.value || 'default'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            </div>
          </div>

          <div className="sticky bottom-0 flex flex-none gap-2 border-t border-black/10 bg-neutral-50 px-4 py-4 sm:px-6">
            <button
              type="submit"
              className="flex-1 rounded-md border border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))] px-6 py-3 font-sans text-[11px] font-medium uppercase tracking-[0.15em] text-[rgb(var(--color-contrast))] transition-colors hover:bg-[rgb(var(--color-primary))]/90"
            >
              Zastosuj
            </button>
            {hasActive ? (
              <Link
                to="."
                preventScrollReset
                className={`${filterButtonClass} flex-1 text-center`}
                onClick={() => closeDrawer()}
              >
                Wyczyść
              </Link>
            ) : null}
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
