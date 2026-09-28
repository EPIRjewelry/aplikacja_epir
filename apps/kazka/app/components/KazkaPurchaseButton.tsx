import {useFetcher, useMatches, useRevalidator, type UIMatch} from '@remix-run/react';
import {useEffect, useRef} from 'react';

type RootMatchData = {
  selectedLocale?: {
    country?: string;
    language?: string;
  };
};

type CartActionJson = {
  error?: string;
  errors?: {message?: string}[];
  cart?: unknown;
};

const addToCartClass =
  'min-h-[2.75rem] w-full border-0 bg-[rgb(var(--color-primary))] px-6 py-3 text-center text-sm font-medium tracking-[0.04em] text-[rgb(var(--color-contrast))] transition-colors hover:bg-[rgb(var(--color-accent))] hover:text-[rgb(var(--color-primary))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

type Props = {
  canPurchase: boolean;
  variantId?: string;
  countryCode?: string;
  promptOption: string | null;
  onIncompleteClick: () => void;
  submitLabel?: string;
};

export function KazkaPurchaseButton({
  canPurchase,
  variantId,
  countryCode,
  promptOption,
  onIncompleteClick,
  submitLabel = 'Do koszyka',
}: Props) {
  const [root] = useMatches() as UIMatch<RootMatchData>[];
  const selectedLocale = root?.data?.selectedLocale;
  const fetcher = useFetcher<CartActionJson>({key: 'add-to-cart'});
  const revalidator = useRevalidator();
  const lastSyncedCart = useRef<unknown>(null);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data?.cart) return;
    if (fetcher.data === lastSyncedCart.current) return;
    if ('error' in fetcher.data && fetcher.data.error) return;
    lastSyncedCart.current = fetcher.data;
    revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);

  if (!canPurchase || !variantId) {
    const label = promptOption ? `Wybierz ${promptOption}` : submitLabel;
    return (
      <div className="grid w-full gap-2">
        <button type="button" className={addToCartClass} onClick={onIncompleteClick}>
          {label}
        </button>
      </div>
    );
  }

  const lines = [{merchandiseId: variantId, quantity: 1}];
  const country =
    selectedLocale?.country ?? countryCode?.trim() ?? 'PL';
  const errMsg =
    fetcher.data && 'error' in fetcher.data && fetcher.data.error
      ? String(fetcher.data.error)
      : null;
  const userErr =
    Array.isArray(fetcher.data?.errors) && fetcher.data.errors[0]
      ? String(fetcher.data.errors[0].message ?? '')
      : null;

  return (
    <div className="grid w-full gap-2">
      <fetcher.Form action="/cart" method="post" className="grid gap-2">
        <input type="hidden" name="countryCode" value={country} />
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <input type="hidden" name="cartAction" value="ADD_TO_CART" />
        {(errMsg || userErr) && fetcher.state === 'idle' ? (
          <p className="text-sm text-red-600" role="alert">
            {errMsg || userErr}
          </p>
        ) : null}
        <button type="submit" className={addToCartClass}>
          {submitLabel}
        </button>
      </fetcher.Form>
    </div>
  );
}
