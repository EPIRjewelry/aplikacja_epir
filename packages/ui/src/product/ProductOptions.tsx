import {
  Link,
  useLocation,
  useNavigation,
  useSearchParams,
} from '@remix-run/react';
import type {
  ProductOption,
  ProductVariant,
} from '@shopify/hydrogen/dist/storefront-api-types';

type Props = {
  options: ProductOption[];
  selectedVariant?: ProductVariant;
};

export default function ProductOptions({options, selectedVariant}: Props) {
  const {pathname} = useLocation();
  const [currentSearchParams] = useSearchParams();
  const navigation = useNavigation();

  const paramsWithDefaults = (() => {
    const defaultParams = new URLSearchParams(currentSearchParams);

    if (!selectedVariant) {
      return defaultParams;
    }

    for (const {name, value} of selectedVariant.selectedOptions) {
      if (!currentSearchParams.has(name)) {
        defaultParams.set(name, value);
      }
    }

    return defaultParams;
  })();

  const searchParams = navigation.location
    ? new URLSearchParams(navigation.location.search)
    : paramsWithDefaults;

  return (
    <div className="mb-6 grid gap-4">
      {options.map((option) => {
        if (!option.values.length) {
          return;
        }

        const currentOptionVal = searchParams.get(option.name);
        return (
          <div
            key={option.name}
            className="mb-4 flex flex-col flex-wrap gap-y-2 last:mb-0"
          >
            <h3
              className="min-w-[4rem] max-w-prose whitespace-pre-wrap text-xs font-normal uppercase tracking-[0.08em] text-[rgb(var(--color-primary))]/75"
            >
              {option.name}
            </h3>

            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const linkParams = new URLSearchParams(searchParams);
                const isSelected = currentOptionVal === value;
                linkParams.set(option.name, value);
                return (
                  <Link
                    key={value}
                    to={`${pathname}?${linkParams.toString()}`}
                    preventScrollReset
                    replace
                    className={`inline-flex min-h-[2.75rem] items-center justify-center border px-4 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2 ${
                      isSelected
                        ? 'border-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary))]/5 text-[rgb(var(--color-primary))]'
                        : 'border-[#F2F2F2] bg-white text-[rgb(var(--color-primary))]/80 hover:border-[rgb(var(--color-primary))]/25'
                    }`}
                    aria-current={isSelected ? 'true' : undefined}
                  >
                    {value}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
