import {Link} from '@remix-run/react';
import type {ProductTrustItem} from '~/lib/kazka-pdp-trust';

const linkClassName =
  'text-[rgb(var(--color-primary))]/80 underline-offset-4 hover:text-[rgb(var(--color-accent))] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--color-accent))] focus-visible:outline-offset-2';

function ProductTrustValue({item}: {item: ProductTrustItem}) {
  if (item.contact) {
    const {prefix, whatsappLabel, suffix, phoneDisplay, phoneTel, whatsappHref} =
      item.contact;
    return (
      <span className="kazka-figure text-[rgb(var(--color-primary))]/80">
        {prefix}
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {whatsappLabel}
        </a>
        {suffix}
        <a href={phoneTel} className={linkClassName}>
          {phoneDisplay}
        </a>
      </span>
    );
  }

  if (item.href) {
    return (
      <Link to={item.href} className={linkClassName}>
        {item.value ?? item.label}
      </Link>
    );
  }

  return (
    <span className="kazka-figure text-[rgb(var(--color-primary))]/80">
      {item.value}
    </span>
  );
}

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
            <ProductTrustValue item={item} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
