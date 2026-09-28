import {useEffect, useState} from 'react';
import {KazkaPurchaseButton} from '~/components/KazkaPurchaseButton';

type Props = {
  priceLabel: string | null;
  variantId?: string;
  countryCode?: string;
  canPurchase: boolean;
  observeTargetId: string;
  promptOption: string | null;
  onIncompleteClick: () => void;
};

export function KazkaPdpStickyBar({
  priceLabel,
  variantId,
  countryCode,
  canPurchase,
  observeTargetId,
  promptOption,
  onIncompleteClick,
}: Props) {
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const target = document.getElementById(observeTargetId);
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowBar(!entry.isIntersecting);
      },
      {root: null, threshold: 0, rootMargin: '0px 0px -1px 0px'},
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [observeTargetId]);

  useEffect(() => {
    const root = document.documentElement;
    if (showBar) {
      root.classList.add('kazka-pdp-sticky-active');
    } else {
      root.classList.remove('kazka-pdp-sticky-active');
    }
    return () => root.classList.remove('kazka-pdp-sticky-active');
  }, [showBar]);

  if (!showBar) return null;

  return (
    <div
      className="kazka-pdp-sticky-bar fixed inset-x-0 bottom-0 z-[45] border-t border-[rgb(var(--color-primary))]/10 bg-[#f5f0e6]/95 px-4 py-3 backdrop-blur-sm md:hidden"
      role="region"
      aria-label="Szybkie dodanie do koszyka"
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        {priceLabel ? (
          <p
            className="shrink-0 font-sans text-lg font-semibold tabular-nums text-[rgb(var(--color-primary))]"
          >
            {priceLabel}
          </p>
        ) : null}
        <div className="min-w-0 flex-1">
          <KazkaPurchaseButton
            countryCode={countryCode}
            variantId={variantId}
            canPurchase={canPurchase}
            promptOption={promptOption}
            onIncompleteClick={onIncompleteClick}
          />
        </div>
      </div>
    </div>
  );
}
