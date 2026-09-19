import {Link} from '@remix-run/react';
import type {ProductTrustItem} from '~/lib/kazka-pdp-trust';

export function KazkaProductTrust({items}: {items: ProductTrustItem[]}) {
  if (!items.length) return null;

  return (
    <aside
      className="kazka-pdp-trust grid gap-4 border-t border-[rgb(var(--color-primary))]/10 pt-6"
      aria-label="Informacje o zakupie"
    >
      <h2 className="kazka-editorial-label text-[rgb(var(--color-primary))]">
        Szczegóły i obsługa
      </h2>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.id} className="grid gap-0.5 font-sans text-sm leading-relaxed">
            <span className="font-medium text-[rgb(var(--color-primary))]">
              {item.label}
            </span>
            {item.href ? (
              <Link
                to={item.href}
                className="text-[rgb(var(--color-primary))]/80 underline-offset-4 hover:text-[rgb(var(--color-accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2"
              >
                {item.value ?? item.label}
              </Link>
            ) : (
              <span className="kazka-figure text-[rgb(var(--color-primary))]/80">{item.value}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
