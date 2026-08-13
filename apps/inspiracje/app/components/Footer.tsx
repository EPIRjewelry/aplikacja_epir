import {Link} from '@remix-run/react';

const INFO_LINKS: [string, string][] = [
  ['Sklep EPIR', 'https://epirbizuteria.pl'],
  ['Kontakt / współtworzenie', 'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model'],
  ['Kazka', 'https://kazka.epirbizuteria.pl'],
  ['Zaręczyny', 'https://zareczyny.epirbizuteria.pl'],
];

export type FooterProps = {
  ctaUrl: string;
};

export function Footer({ctaUrl}: FooterProps) {
  return (
    <footer
      role="contentinfo"
      className="bg-[rgb(var(--color-primary))] text-[rgb(var(--color-contrast))]"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-12 md:grid-cols-3 md:gap-12 md:px-8 lg:gap-16 lg:px-12">
        <section className="flex flex-col gap-2 text-sm leading-relaxed text-[rgb(var(--color-contrast))]/95">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--color-accent))]">
            Pracownia biżuterii
          </h2>
          <p className="font-semibold">EPIR Art Jewellery — Archiwum Inspiracji</p>
          <p>50-419 Wrocław</p>
          <p>ul. Gen. R. Traugutta 123/5-6</p>
          <p>
            <a
              className="hover:text-[rgb(var(--color-accent))] hover:underline underline-offset-4"
              href="tel:+48698718564"
            >
              +48 698 718 564
            </a>
          </p>
          <p>
            <a
              className="hover:text-[rgb(var(--color-accent))] hover:underline underline-offset-4"
              href="mailto:epir@epirbizuteria.pl"
            >
              epir@epirbizuteria.pl
            </a>
          </p>
        </section>

        <nav
          aria-labelledby="footer-informacje-heading"
          className="flex flex-col gap-4"
        >
          <h2
            id="footer-informacje-heading"
            className="font-semibold text-[rgb(var(--color-accent))]"
          >
            Powiązane
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {INFO_LINKS.map(([label, href]) => (
              <li key={href}>
                <a
                  className="text-[rgb(var(--color-contrast))]/95 hover:text-[rgb(var(--color-accent))] hover:underline underline-offset-4"
                  href={href === INFO_LINKS[1][1] ? ctaUrl : href}
                  rel="noopener noreferrer"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section className="flex flex-col gap-4 md:items-end md:text-right">
          <Link
            to="/"
            className="flex flex-col items-start gap-3 rounded-sm outline-offset-4 transition-opacity hover:opacity-90 md:items-end"
          >
            <span className="text-2xl font-bold tracking-wide text-[rgb(var(--color-accent))] md:text-3xl">
              EPIR
            </span>
            <span className="text-lg font-semibold tracking-wide md:text-xl">
              Archiwum Inspiracji
            </span>
          </Link>
          <p className="max-w-md text-sm leading-relaxed text-[rgb(var(--color-contrast))]/95 md:ml-auto">
            Wyroby sprzedane — inspiracja do zamówień indywidualnych. Bez cen,
            bez koszyka: tylko historia formy i rzemiosła.
          </p>
        </section>
      </div>
      <div className="border-t border-[rgb(var(--color-contrast))]/20 py-4 text-center text-sm text-[rgb(var(--color-contrast))]/90">
        © <span suppressHydrationWarning>{new Date().getFullYear()}</span> EPIR
        Art Jewellery — Archiwum Inspiracji
      </div>
    </footer>
  );
}
