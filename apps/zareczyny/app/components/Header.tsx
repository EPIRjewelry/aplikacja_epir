import {Link, useLocation} from '@remix-run/react';

export type NavCollection = {id: string; title: string; handle: string};

export type HeaderProps = {
  brandName: string;
  collections: NavCollection[];
  cartQuantity: number;
  onOpenCart: () => void;
  renderCartHeader: (props: {
    cartQuantity: number;
    openDrawer: () => void;
  }) => React.ReactNode;
};

export function Header({
  brandName,
  collections,
  cartQuantity,
  onOpenCart,
  renderCartHeader,
}: HeaderProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  // Determine which collection links to show
  let navLinks: NavCollection[] = [];

  if (currentPath === '/') {
    // Homepage: show both collections (filter out the hub "Pierścionki zaręczynowe")
    navLinks = collections.filter(
      (c) => c.handle === 'zareczyny-zlote' || c.handle === 'zareczyny-srebrne'
    );
  } else if (currentPath.includes('zareczyny-srebrne')) {
    // On srebrne collection: show only zlote link
    navLinks = collections.filter((c) => c.handle === 'zareczyny-zlote');
  } else if (currentPath.includes('zareczyny-zlote')) {
    // On zlote collection: show only srebrne link
    navLinks = collections.filter((c) => c.handle === 'zareczyny-srebrne');
  } else {
    // Other pages: show both
    navLinks = collections.filter(
      (c) => c.handle === 'zareczyny-zlote' || c.handle === 'zareczyny-srebrne'
    );
  }

  return (
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
          {navLinks.length > 0 ? (
            navLinks.map((c) => (
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
          {renderCartHeader({
            cartQuantity,
            openDrawer: onOpenCart,
          })}
        </div>
      </nav>
    </header>
  );
}
