const SECTION_HERO_FRAGMENT = `#graphql
  fragment SectionHero on Metaobject {
    type
    id
    heading: field(key: "heading") {
      key
      type
      value
    }
    subheading: field(key: "subheading") {
      key
      type
      value
    }
    image: field(key: "image") {
      key
      reference {
        __typename
        ... on MediaImage {
          mediaContentType
          alt
          previewImage { url }
          image { url altText width height }
        }
        ... on Video {
          mediaContentType
          alt
          previewImage { url }
          sources { mimeType url }
        }
        ... on GenericFile {
          url
          alt
          previewImage { url }
        }
      }
    }
    cta_href: field(key: "cta_href") { key type value }
    cta_text: field(key: "cta_text") { key type value }
    cta_target: field(key: "cta_target") { key type value }
  }
`;

const SECTION_FEATURED_COLLECTIONS_FRAGMENT = `#graphql
  fragment SectionFeaturedCollections on Metaobject {
    type
    id
    heading: field(key: "heading") {
      key
      type
      value
    }
    collections: field(key: "collections") {
      key
      references(first: 10) {
        nodes {
          ... on Collection {
            id
            title
            handle
            image {
              url
              altText
              width
              height
            }
          }
        }
      }
    }
  }
`;

const SECTION_FEATURED_PRODUCTS_FRAGMENT = `#graphql
  fragment SectionFeaturedProducts on Metaobject {
    type
    id
    heading: field(key: "heading") {
      key
      type
      value
    }
    body: field(key: "body") {
      key
      type
      value
    }
    products: field(key: "products") {
      key
      references(first: 10) {
        nodes {
          ... on Product {
            id
            title
            handle
            productType
            variants(first: 1) {
              nodes {
                image {
                  url
                  altText
                  width
                  height
                }
              }
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
    with_product_prices: field(key: "with_product_prices") {
      key
      type
      value
    }
  }
`;

export const SECTIONS_HERO_FRAGMENT = `#graphql
  fragment SectionsHero on MetaobjectField {
    references(first: 10) {
      nodes {
        ... on Metaobject {
          id
          type
          ...SectionHero
        }
      }
    }
  }
  ${SECTION_HERO_FRAGMENT}
`;

export const SECTIONS_FEATURED_COLLECTIONS_FRAGMENT = `#graphql
  fragment SectionsFeaturedCollections on MetaobjectField {
    references(first: 10) {
      nodes {
        ... on Metaobject {
          id
          type
          ...SectionFeaturedCollections
        }
      }
    }
  }
  ${SECTION_FEATURED_COLLECTIONS_FRAGMENT}
`;

export const SECTIONS_FEATURED_PRODUCTS_FRAGMENT = `#graphql
  fragment SectionsFeaturedProducts on MetaobjectField {
    references(first: 10) {
      nodes {
        ... on Metaobject {
          id
          type
          ...SectionFeaturedProducts
        }
      }
    }
  }
  ${SECTION_FEATURED_PRODUCTS_FRAGMENT}
`;
