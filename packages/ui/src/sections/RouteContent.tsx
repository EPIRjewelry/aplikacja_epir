import {Sections, type SectionField} from './Sections';
import {
  SECTIONS_HERO_FRAGMENT,
  SECTIONS_FEATURED_COLLECTIONS_FRAGMENT,
  SECTIONS_FEATURED_PRODUCTS_FRAGMENT,
} from './fragments';

export type RouteContentProps = {
  route: {
    id?: string;
    type?: string;
    title?: {key?: string; value?: string};
    sections?: SectionField;
    featured_collections?: SectionField;
    featured_products?: SectionField;
  } | null;
};

function getNodes(field: SectionField | undefined): unknown[] {
  return field?.references?.nodes ?? field?.nodes ?? [];
}

export function RouteContent({route}: RouteContentProps) {
  if (!route) return null;

  const heroNodes = getNodes(route.sections);
  const collectionsNodes = getNodes(route.featured_collections);
  const productsNodes = getNodes(route.featured_products);

  const hasSections =
    heroNodes.length > 0 || collectionsNodes.length > 0 || productsNodes.length > 0;

  if (!hasSections) return null;

  return (
    <div className="flex flex-col">
      <Sections
        sections={route.sections}
        featured_collections={route.featured_collections}
        featured_products={route.featured_products}
      />
    </div>
  );
}

export const ROUTE_CONTENT_QUERY = `#graphql
  query RouteContent($handle: MetaobjectHandleInput!) {
    route: metaobject(handle: $handle) {
      type
      id
      title: field(key: "title") {
        key
        type
        value
      }
      sections: field(key: "sections") {
        ...SectionsHero
      }
      featured_collections: field(key: "featured_collections") {
        ...SectionsFeaturedCollections
      }
      featured_products: field(key: "featured_products") {
        ...SectionsFeaturedProducts
      }
    }
  }
  ${SECTIONS_HERO_FRAGMENT}
  ${SECTIONS_FEATURED_COLLECTIONS_FRAGMENT}
  ${SECTIONS_FEATURED_PRODUCTS_FRAGMENT}
`;
