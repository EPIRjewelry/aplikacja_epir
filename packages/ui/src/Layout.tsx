import {Link} from '@remix-run/react';
import {Drawer, useDrawer} from './Drawer';
import {useFetchers} from '@remix-run/react';
import {useEffect} from 'react';

export type NavCollection = {id: string; title: string; handle: string};

export type LayoutProps = {
  children: React.ReactNode;
  title: string;
  collections?: NavCollection[];
  cart?: unknown;
  renderCartHeader: (props: {cart: unknown; openDrawer: () => void}) => React.ReactNode;
  renderCartDrawer: (props: {cart: unknown; close: () => void}) => React.ReactNode;
};

export function Layout({
  children,
  title,
  collections = [],
  cart,
  renderCartHeader,
  renderCartDrawer,
}: LayoutProps) {
  const {isOpen, openDrawer, closeDrawer} = useDrawer();
  const fetchers = useFetchers();

  const addToCartFetchers = [];
  for (const fetcher of fetchers) {
    if (fetcher?.formData?.get('cartAction') === 'ADD_TO_CART') {
      addToCartFetchers.push(fetcher);
    }
  }
  useEffect(() => {
    if (isOpen || addToCartFetchers.length === 0) return;
    openDrawer();
  }, [addToCartFetchers, isOpen, openDrawer]);

  const brandName = title || 'EPIR Art Jewellery & Gemstone';

  return (
    <div className="flex flex-col min-h-screen antialiased bg-[rgb(var(--color-contrast))] text-[rgb(var(--color-primary))]">
      <header
        role="banner"
        className="flex items-center h-[var(--height-nav)] sticky top-0 z-40 w-full leading-none gap-8 px-6 md:px-8 lg:px-12 border-b border-black/10 bg-[rgb(var(--color-contrast))]/80 backdrop-blur-md"
      >
        <nav className="flex items-center gap-4 md:gap-8 w-full">
          <Link
            to="/"
            className="font-bold text-xl tracking-wide hover:opacity-80 transition-opacity"
          >
            {brandName}
          </Link>
          <div className="flex gap-4 md:gap-6">
            {collections.length > 0 ? (
              collections.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  to={`/collections/${c.handle}`}
                  className="hidden sm:inline text-sm hover:underline underline-offset-4"
                >
                  {c.title}
                </Link>
              ))
            ) : (
              <Link
                to="/collections"
                className="hidden sm:inline text-sm hover:underline underline-offset-4"
              >
                Kolekcje
              </Link>
            )}
          </div>
          <div className="ml-auto">
            {renderCartHeader({cart, openDrawer})}
          </div>
        </nav>
      </header>

      <main
        role="main"
        id="mainContent"
        className="flex-grow p-6 md:p-8 lg:px-12"
      >
        {children}
        <Drawer open={isOpen} onClose={closeDrawer}>
          {renderCartDrawer({cart, close: closeDrawer})}
        </Drawer>
      </main>

      <footer
        role="contentinfo"
        className="border-t border-black/10 py-12 px-6 md:px-8 lg:px-12"
      >
        <div className="flex flex-col md:flex-row gap-8 md:gap-12 max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            <Link to="/" className="font-bold text-lg hover:opacity-80">
              {brandName}
            </Link>
            <p className="text-sm text-black/70 max-w-xs">
              Luksusowe pierścionki zaręczynowe i biżuteria.
            </p>
          </div>
          <div className="flex flex-wrap gap-8 md:gap-12">
            <div>
              <h3 className="font-semibold text-sm mb-3">Nawigacja</h3>
              <ul className="flex flex-col gap-2 text-sm">
                <li>
                  <Link to="/" className="hover:underline underline-offset-4">
                    Strona główna
                  </Link>
                </li>
                <li>
                  <Link to="/chat" className="hover:underline underline-offset-4">
                    Czat
                  </Link>
                </li>
                {collections.slice(0, 4).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/collections/${c.handle}`}
                      className="hover:underline underline-offset-4"
                    >
                      {c.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-black/10 text-center text-sm text-black/60">
          © {new Date().getFullYear()} {brandName}. Wszelkie prawa zastrzeżone.
        </div>
      </footer>
    </div>
  );
}
