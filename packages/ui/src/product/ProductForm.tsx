import {useFetcher, useMatches, type UIMatch} from '@remix-run/react';

type RootMatchData = {
  selectedLocale?: {
    country?: string;
  };
};

export function ProductForm(props: {variantId?: string}) {
  const [root] = useMatches() as UIMatch<RootMatchData>[];
  const selectedLocale = root?.data?.selectedLocale;
  const fetcher = useFetcher();

  if (!props.variantId) return null;

  const lines = [{merchandiseId: props.variantId, quantity: 1}];

  return (
    <fetcher.Form action="/cart" method="post">
      <input type="hidden" name="cartAction" value={'ADD_TO_CART'} />
      <input
        type="hidden"
        name="countryCode"
        value={selectedLocale?.country ?? 'US'}
      />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <button className="bg-epir-base hover:bg-epir-accent text-white px-6 py-3 w-full rounded-md text-center font-medium max-w-[400px] transition-colors">
        Do koszyka
      </button>
    </fetcher.Form>
  );
}
