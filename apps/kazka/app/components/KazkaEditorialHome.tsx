import {type RouteContentProps} from '@epir/ui';
import {KazkaEditorialCategoryTiles} from '~/components/KazkaEditorialCategoryTiles';
import {KazkaEditorialHero} from '~/components/KazkaEditorialHero';
import {KazkaEditorialVideoSection} from '~/components/KazkaEditorialVideoSection';
import {KazkaFeaturedProducts} from '~/components/KazkaFeaturedProducts';
import {parseCmsFeaturedProductsSections} from '~/lib/kazka-cms-featured-products';
import {parseCmsHeroSlides} from '~/lib/kazka-cms-hero';

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
 * Homepage Kazka — hero (CMS metaobiekt, Orska UI) → featured products (CMS) → kafle → YouTube.
 * featured_products na route-kazka-home; pusta lista = sekcja ukryta.
 * Hero: parseCmsHeroSlides(route); pusty CMS → fallback w KazkaEditorialHero.
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
  const heroSlides = parseCmsHeroSlides(route);
  const featuredProductsSections = parseCmsFeaturedProductsSections(route);

  return (
    <div className="kazka-home flex w-full flex-col overflow-x-clip">
      <KazkaEditorialHero slides={heroSlides} />
      {featuredProductsSections.map((section) => (
        <KazkaFeaturedProducts key={section.id} {...section} />
      ))}
      <KazkaEditorialCategoryTiles />
      <KazkaEditorialVideoSection />
    </div>
  );
}
