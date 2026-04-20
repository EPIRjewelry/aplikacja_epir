import {SectionHero} from './SectionHero';
import {SectionFeaturedProducts} from './SectionFeaturedProducts';
import {SectionFeaturedCollections} from './SectionFeaturedCollections';

type SectionNode = {
  type?: string;
  id?: string;
  [key: string]: unknown;
};

type SectionField = {
  references?: {nodes?: SectionNode[]};
  nodes?: SectionNode[];
};

export type SectionsProps = {
  sections?: SectionField;
  featured_collections?: SectionField;
  featured_products?: SectionField;
};

function getNodes(field: SectionField | undefined): SectionNode[] {
  return field?.references?.nodes ?? field?.nodes ?? [];
}

export function Sections({
  sections,
  featured_collections,
  featured_products,
}: SectionsProps) {
  const nodes = [
    ...getNodes(sections),
    ...getNodes(featured_collections),
    ...getNodes(featured_products),
  ];

  return (
    <div className="flex flex-col gap-0">
      {nodes.map((section, i) => {
        if (!section) return null;
        switch (section.type) {
          case 'section_hero':
            return <SectionHero key={section.id ?? i} {...(section as Parameters<typeof SectionHero>[0])} />;
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
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

