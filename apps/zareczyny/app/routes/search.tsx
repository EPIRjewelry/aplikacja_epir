// TODO: Zaimplementować docelową wyszukiwarkę w oparciu o Storefront API (Hydrogen storefront.query).
// Ten komponent jest tymczasowym placeholderem, żeby link /search z Headera nie zwracał 404.

import {Link} from '@remix-run/react';

const linkClass =
  'font-medium text-[#2c684e] no-underline underline-offset-4 transition-[color,text-decoration-color] duration-150 ease-out hover:text-[#8a8175] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2c684e] focus-visible:outline-offset-2';

export default function Search() {
  return (
    <div className="mx-auto mt-12 max-w-prose px-6 pb-12 md:mt-16 md:px-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-[rgb(var(--color-primary))]">
        Wyszukiwarka w przygotowaniu
      </h1>
      <p className="mb-8 text-base leading-relaxed text-black/70">
        Pracujemy nad wyszukiwarką biżuterii EPIR. Wróć tu wkrótce lub przejdź do kolekcji.
      </p>
      <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Przejście dalej">
        <Link to="/collections" className={linkClass}>
          Kolekcje
        </Link>
        <Link to="/" className={linkClass}>
          Strona główna
        </Link>
      </nav>
    </div>
  );
}
