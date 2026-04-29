import {Link} from '@remix-run/react';

const INFO_LINKS: [string, string][] = [
  ['Regulamin', '/pages/regulamin-epir-art-jewellery'],
  ['Polityka Prywatności', '/pages/polityka-prywatnosci'],
  ['Wysyłka', '/pages/wysylka'],
  ['Płatność', '/pages/platnosc'],
  ['O nas', '/pages/o-nas'],
  ['Kontakt', '/pages/kontakt'],
  ['Polityka Cookies', '/pages/polityka-cookies'],
  ['Polityka Zwrotów', '/pages/polityka-zwrotow'],
];

export function Footer() {
  return (
    <footer role="contentinfo" className="bg-[#2c684e] text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-12 md:grid-cols-3 md:gap-12 md:px-8 lg:gap-16 lg:px-12">
        <section className="flex flex-col gap-2 text-sm leading-relaxed text-white/95">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/75">
            Pracownia biżuterii
          </h2>
          <p className="font-semibold text-white">{'EPIR Art Jewellery&Gemstone'}</p>
          <p className="text-white/95">50-419 Wrocław</p>
          <p className="text-white/95">ul. Gen. R. Traugutta 123/5-6</p>
          <p>
            <a className="hover:underline underline-offset-4" href="tel:+48698718564">
              +48 698 718 564
            </a>
          </p>
          <p>
            <a
              className="hover:underline underline-offset-4"
              href="mailto:epir@epirbizuteria.pl"
            >
              epir@epirbizuteria.pl
            </a>
          </p>
        </section>

        <nav aria-labelledby="footer-informacje-heading" className="flex flex-col gap-4">
          <h2 id="footer-informacje-heading" className="font-semibold text-white">
            Informacje
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {INFO_LINKS.map(([label, to]) => (
              <li key={to}>
                <Link className="text-white/95 hover:text-white hover:underline underline-offset-4" to={to}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section className="flex flex-col gap-4 md:items-end md:text-right">
          <Link
            to="/"
            className="flex flex-col items-start gap-3 rounded-sm outline-offset-4 transition-opacity hover:opacity-90 md:items-end"
          >
            <img
              src="/images/epir-footer-logo.png"
              alt="EPIR Art Jewellery"
              width={280}
              height={120}
              loading="eager"
              decoding="async"
              className="block h-auto max-h-24 w-auto max-w-[min(280px,92vw)] shrink-0 object-contain md:self-end"
            />
            <span className="font-heading text-lg font-semibold tracking-wide text-white md:text-xl">
              EPIR Art Jewellery
            </span>
          </Link>
          <p className="max-w-md text-sm leading-relaxed text-white/95 md:ml-auto">
            Złoty blask, srebro, kamień. EPIRu sztuka w kruszcu tkwi, Natura w każdym szczególe.
          </p>
        </section>
      </div>
      <div className="border-t border-white/20 py-4 text-center text-sm text-white/90">
        {'© EPIR Art Jewellery&Gemstone 2024'}
      </div>
    </footer>
  );
}
