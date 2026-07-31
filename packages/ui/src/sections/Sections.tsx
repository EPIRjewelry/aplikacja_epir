import {SectionHero} from './SectionHero';
import {SectionFeaturedProducts} from './SectionFeaturedProducts';
import {SectionFeaturedCollections} from './SectionFeaturedCollections';

export type SectionNode = {
  type?: string;
  id?: string;
  [key: string]: unknown;
};

export type SectionField = {
  references?: {nodes?: SectionNode[]};
  nodes?: SectionNode[];
};

export type SectionsProps = {
  /** Ordered section fields from the parent (route metaobject field order). */
  fields: SectionField[];
  featuredCollectionsExcludeHandles?: readonly string[];
  hideFeaturedCollectionsHeading?: boolean;
};

function getNodes(field: SectionField | undefined): SectionNode[] {
  return field?.references?.nodes ?? field?.nodes ?? [];
}

/**
 * Renders metaobject section nodes in the order of `fields`.
 * Order is owned by the caller (RouteContent) — this component does not pick field sequence.
 */
export function Sections({
  fields,
  featuredCollectionsExcludeHandles,
  hideFeaturedCollectionsHeading = false,
}: SectionsProps) {
  const nodes = fields.flatMap((field) => getNodes(field));

  return (
    <div className="flex flex-col gap-0">
      {nodes.map((section, i) => {
        if (!section) return null;
        switch (section.type) {
          case 'section_hero':
            return (
              <SectionHero
                key={section.id ?? i}
                {...(section as Parameters<typeof SectionHero>[0])}
              />
            );
          case 'section_featured_products':
            return (
              <SectionFeaturedProducts
                key={section.id ?? i}
                {...(section as Parameters<typeof SectionFeaturedProducts>[0])}
              />
            );
          case 'section_featured_collections':
            return (
              <SectionFeaturedCollections
                key={section.id ?? i}
                {...(section as Parameters<typeof SectionFeaturedCollections>[0])}
                excludeHandles={featuredCollectionsExcludeHandles}
                hideHeading={hideFeaturedCollectionsHeading}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
