import {type RouteContentProps} from '@epir/ui';
import {KazkaEditorialCategoryTiles} from '~/components/KazkaEditorialCategoryTiles';
import {KazkaEditorialHero} from '~/components/KazkaEditorialHero';
import {KazkaEditorialVideoSection} from '~/components/KazkaEditorialVideoSection';
import {KazkaFeaturedProducts} from '~/components/KazkaFeaturedProducts';
import {parseCmsFeaturedProductsSections} from '~/lib/kazka-cms-featured-products';

type FeaturedProduct = {
  id: string;
  title: string;
  handle: string;
};

type FeaturedCollection = {
  id: string;
  title: string;
  handle: string;
};

/**
 * Homepage Kazka — hero (Orska viewport) → featured products (CMS) → kafle → YouTube.
 * featured_products na route-kazka-home; pusta lista = sekcja ukryta.
 */
export function KazkaEditorialHome({
  route,
  collections: _collections,
  products: _products,
  hubCollectionHandle: _hubCollectionHandle,
}: {
  route: RouteContentProps['route'];
  collections: {nodes: FeaturedCollection[]};
  products: {nodes: FeaturedProduct[]};
  hubCollectionHandle: string;
}) {
  const featuredProductsSections = parseCmsFeaturedProductsSections(route);

  return (
    <div className="flex w-full flex-col">
      {/* Editorial fallback slides — CMS hero-kazka is legacy marketing dyptych, not Orska fill */}
      <KazkaEditorialHero slides={[]} />
      {featuredProductsSections.map((section) => (
        <KazkaFeaturedProducts key={section.id} {...section} />
      ))}
      <KazkaEditorialCategoryTiles />
      <KazkaEditorialVideoSection />
    </div>
  );
}
