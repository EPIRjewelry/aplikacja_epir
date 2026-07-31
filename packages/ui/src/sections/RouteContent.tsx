import {Sections, type SectionField} from './Sections';
import {
  SECTIONS_HERO_FRAGMENT,
  SECTIONS_FEATURED_COLLECTIONS_FRAGMENT,
  SECTIONS_FEATURED_PRODUCTS_FRAGMENT,
} from './fragments';

/**
 * Kolejność pól metaobiektu `route` (Shopify):
 * sections → featured_collections → featured_products (kategorie przed produktami).
 * Jedyny SSOT kolejności renderu — `Sections` tylko iteruje tę listę.
 */
export const ROUTE_SECTION_FIELD_KEYS = [
  'sections',
  'featured_collections',
  'featured_products',
] as const;

export type RouteSectionFieldKey = (typeof ROUTE_SECTION_FIELD_KEYS)[number];

export type RouteContentProps = {
  route: {
    id?: string;
    type?: string;
    title?: {key?: string; value?: string};
    sections?: SectionField;
    featured_collections?: SectionField;
    featured_products?: SectionField;
  } | null;
  /** Pomiń hub / nie-kategorie w kaflach (np. `kazka`). */
  featuredCollectionsExcludeHandles?: readonly string[];
  /** Ukryj H2 sekcji featured_collections (Hydrogen — bez zmiany Admin). */
  hideFeaturedCollectionsHeading?: boolean;
};

function getNodes(field: SectionField | undefined): unknown[] {
  return field?.references?.nodes ?? field?.nodes ?? [];
}

function orderedSectionFields(
  route: NonNullable<RouteContentProps['route']>,
): SectionField[] {
  return ROUTE_SECTION_FIELD_KEYS.map((key) => route[key]).filter(
    (field): field is SectionField => field != null,
  );
}

export function RouteContent({
  route,
  featuredCollectionsExcludeHandles,
  hideFeaturedCollectionsHeading = false,
}: RouteContentProps) {
  if (!route) return null;

  const fields = orderedSectionFields(route);
  const hasSections = fields.some((field) => getNodes(field).length > 0);

  if (!hasSections) return null;

  return (
    <div className="flex flex-col">
      <Sections
        fields={fields}
        featuredCollectionsExcludeHandles={featuredCollectionsExcludeHandles}
        hideFeaturedCollectionsHeading={hideFeaturedCollectionsHeading}
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
      featured_products: field(key: "featured_products") {
        ...SectionsFeaturedProducts
      }
      featured_collections: field(key: "featured_collections") {
        ...SectionsFeaturedCollections
      }
    }
  }
  ${SECTIONS_HERO_FRAGMENT}
  ${SECTIONS_FEATURED_PRODUCTS_FRAGMENT}
  ${SECTIONS_FEATURED_COLLECTIONS_FRAGMENT}
`;
