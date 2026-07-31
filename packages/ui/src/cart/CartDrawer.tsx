import {Suspense} from 'react';
import {Await} from '@remix-run/react';
import {CartLineItems} from './CartLineItems';
import {CartSummary} from './CartSummary';
import {CartActions} from './CartActions';
import type {CartDrawerData, DeferredCart} from './types';

export function CartDrawer({
  cart,
  close,
}: {
  cart: DeferredCart<CartDrawerData>;
  close: () => void;
}) {
  return (
    <Suspense>
      <Await resolve={cart}>
        {(data) => {
          const hasLineItems =
            data?.lines?.edges != null && data.lines.edges.length > 0;
          const hasQuantity = (data?.totalQuantity ?? 0) > 0;

          if (hasLineItems && hasQuantity) {
            return (
              <>
                <div className="flex-1 overflow-y-auto">
                  <div className="flex flex-col space-y-7 justify-between items-center md:py-8 md:px-12 px-4 py-6">
                    <CartLineItems linesObj={data.lines} />
                  </div>
                </div>
                <div className="w-full md:px-12 px-4 py-6 space-y-6 border border-1 border-gray-00">
                  <CartSummary cost={data.cost} />
                  <CartActions checkoutUrl={data.checkoutUrl ?? undefined} />
                </div>
              </>
            );
          }

          if (hasQuantity && !hasLineItems) {
            return (
              <div className="flex flex-col space-y-4 justify-center items-center md:py-8 md:px-12 px-4 py-6 min-h-[40vh]">
                <p className="text-sm text-black/70">Ładowanie koszyka…</p>
                <button
                  type="button"
                  onClick={close}
                  className="inline-block rounded-sm font-medium text-center py-3 px-6 max-w-xl leading-none bg-black text-white w-full"
                >
                  Kontynuuj zakupy
                </button>
              </div>
            );
          }

          return (
            <div className="flex flex-col space-y-7 justify-center items-center md:py-8 md:px-12 px-4 py-6 h-screen">
              <h2 className="whitespace-pre-wrap max-w-prose font-bold text-4xl">
                Koszyk jest pusty
              </h2>
              <button
                type="button"
                onClick={close}
                className="inline-block rounded-sm font-medium text-center py-3 px-6 max-w-xl leading-none bg-black text-white w-full"
              >
                Kontynuuj zakupy
              </button>
            </div>
          );
        }}
      </Await>
    </Suspense>
  );
}
