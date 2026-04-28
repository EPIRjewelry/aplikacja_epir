import {Form, useFetcher, useMatches, type UIMatch} from '@remix-run/react';

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

export function ProductForm(props: {
  variantId?: string;
  /** Gdy brak `selectedLocale` w root; np. kraj z `storefront.i18n` (PL zamiast domyślnego US). */
  countryCode?: string;
  /** Pokazuj tylko w aplikacjach, których route `/cart` obsługuje akcję BUY_NOW. */
  showBuyNow?: boolean;
}) {
  const [root] = useMatches() as UIMatch<RootMatchData>[];
  const selectedLocale = root?.data?.selectedLocale;
  const fetcher = useFetcher<CartActionJson>();

  if (!props.variantId) return null;

  const lines = [{merchandiseId: props.variantId, quantity: 1}];
  /** Domyślnie PL (sklepy EPIR); nadpisz przez root `selectedLocale` lub props `countryCode`. */
  const country =
    selectedLocale?.country ?? props.countryCode?.trim() ?? 'PL';
  const errMsg =
    fetcher.data && 'error' in fetcher.data && fetcher.data.error
      ? String(fetcher.data.error)
      : null;
  const userErr =
    Array.isArray(fetcher.data?.errors) && fetcher.data.errors[0]
      ? String(fetcher.data.errors[0].message ?? '')
      : null;

  return (
    <div className="grid gap-2 max-w-[400px]">
      <fetcher.Form action="/cart" method="post" className="grid gap-2">
        <input type="hidden" name="countryCode" value={country} />
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <input type="hidden" name="cartAction" value="ADD_TO_CART" />
      {(errMsg || userErr) && fetcher.state === 'idle' ? (
        <p className="text-sm text-red-600" role="alert">
          {errMsg || userErr}
        </p>
      ) : null}
      <button
        type="submit"
        className="bg-epir-base hover:bg-epir-accent text-white px-6 py-3 w-full rounded-md text-center font-medium transition-colors"
      >
        Do koszyka
      </button>
      </fetcher.Form>
      {props.showBuyNow ? (
        <Form action="/cart" method="post">
          <input type="hidden" name="countryCode" value={country} />
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <input type="hidden" name="cartAction" value="BUY_NOW" />
          <button
            type="submit"
            className="border border-[rgb(var(--color-primary))] bg-white text-[rgb(var(--color-primary))] hover:bg-black/5 px-6 py-3 w-full rounded-md text-center font-medium transition-colors"
          >
            Kup teraz
          </button>
        </Form>
      ) : null}
    </div>
  );
}
