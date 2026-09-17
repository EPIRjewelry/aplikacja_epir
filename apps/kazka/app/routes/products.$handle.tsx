import {json, redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction, useLoaderData} from '@remix-run/react';
import {ProductGallery, ProductOptions, ProductForm} from '@epir/ui';
import {getSeoMeta, Money} from '@shopify/hydrogen';
import {KazkaProductTrust} from '~/components/KazkaProductTrust';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {
  buildKazkaProductTrustItems,
  kazkaProductStoneLabel,
} from '~/lib/kazka-pdp-trust';
import {buildProductJsonLd} from '~/lib/product-json-ld';

type KazkaProductGalleryProps = {
  medias: Parameters<typeof ProductGallery>[0]['medias'];
  featuredFit?: Parameters<typeof ProductGallery>[0]['featuredFit'];
  featuredObjectPosition?: string;
  featuredBackground?: string;
  layout?: Parameters<typeof ProductGallery>[0]['layout'];
};

function KazkaProductGallery(props: KazkaProductGalleryProps) {
  return (
    <div className="kazka-pdp-gallery min-w-0 lg:col-span-2">
      <ProductGallery {...props} />
    </div>
  );
}

export async function loader({params, context, request}: LoaderFunctionArgs) {
  const {handle} = params;
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const selectedOptions: {name: string; value: string}[] = [];

  searchParams.forEach((value, name) => {
    selectedOptions.push({name, value});
  });

  const {product} = await context.storefront.query(PRODUCT_QUERY, {
    variables: {
      handle,
      selectedOptions,
    },
  });

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  const variantNodes = product.variants?.nodes ?? [];

  if (selectedOptions.length === 0 && !product.selectedVariant && variantNodes.length > 0) {
    const defaultVariant =
      variantNodes.find((v: {availableForSale?: boolean}) => v.availableForSale) ??
      variantNodes[0];
    if (defaultVariant?.selectedOptions?.length) {
      const next = new URL(request.url);
      for (const {name, value} of defaultVariant.selectedOptions) {
        next.searchParams.set(name, value);
      }
      if (next.search !== url.search) {
        return redirect(`${next.pathname}${next.search}`, 302);
      }
    }
  }

  const selectedVariant =
    product.selectedVariant ??
    product.variants?.nodes?.find(
      (v: {availableForSale?: boolean}) => v.availableForSale,
    ) ??
    product.variants?.nodes?.[0] ??
    null;
  return json({
    product,
    selectedVariant,
    countryCode: context.storefront.i18n.country,
    canonicalUrl: canonicalUrlFromRequest(request, context.env),
  });
}

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.product) {
    return [];
  }
  const p = data.product;
  const title = p.seo?.title?.trim() || p.title;
  const rawDescription =
    p.seo?.description?.trim() ||
    (typeof p.description === 'string' ? p.description.slice(0, 154) : undefined);
  const description = rawDescription?.slice(0, 154);
  const offerPrice = data.selectedVariant?.price ?? p.priceRange?.minVariantPrice;

  return getSeoMeta({
    title,
    description,
    url: data.canonicalUrl,
    media: p.featuredImage?.url
      ? {
          type: 'image' as const,
          url: p.featuredImage.url,
          altText: p.featuredImage.altText ?? p.title,
          width: p.featuredImage.width ?? undefined,
          height: p.featuredImage.height ?? undefined,
        }
      : undefined,
    jsonLd: buildProductJsonLd({
      product: p,
      canonicalUrl: data.canonicalUrl,
      availableForSale: data.selectedVariant?.availableForSale,
      offerPrice,
    }),
  });
};

function splitDescriptionHtml(html: string): {
  visibleHtml: string;
  specHtml: string | null;
} {
  const marker = 'Specyfikacja';
  const idx = html.indexOf(marker);
  if (idx === -1) return {visibleHtml: html, specHtml: null};

  let visibleHtml = html.slice(0, idx);
  let specHtml = html.slice(idx);

  visibleHtml = visibleHtml.replace(/<h4>\s*$/i, '');
  specHtml = specHtml.replace(/^Specyfikacja\s*<\/h4>\s*/i, '');

  return {visibleHtml, specHtml};
}

export default function ProductHandle() {
  const {product, selectedVariant, countryCode} = useLoaderData<typeof loader>();
  const variantId = selectedVariant?.id;
  const hasPrice = Boolean(selectedVariant?.price?.amount);
  const showPurchaseForm = Boolean(variantId && hasPrice);
  const trustItems = buildKazkaProductTrustItems(product);
  const stoneLabel = kazkaProductStoneLabel(product);
  const {visibleHtml, specHtml} = splitDescriptionHtml(product.descriptionHtml ?? '');
  const featuredObjectPosition = product.tags?.includes('kazka-naszyjnik')
    ? 'center 65%'
    : 'center 50%';
  const featuredFit = product.tags?.includes('kazka-naszyjnik')
    ? 'cover'
    : 'contain';

  return (
    <section className="kazka-pdp grid w-full gap-4 md:gap-8">
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-3 lg:gap-12">
        <KazkaProductGallery
          medias={product.media.nodes}
          layout="editorial"
          featuredFit={featuredFit}
          featuredObjectPosition={featuredObjectPosition}
          featuredBackground="#f5f0e6"
        />
        <div className="kazka-pdp-panel grid w-full max-w-xl gap-8 px-6 md:sticky md:top-[6rem] md:max-w-none md:px-8 lg:top-[8rem] lg:pl-8 lg:pr-12 xl:top-[10rem]">
          <div className="grid gap-2">
            <p className="kazka-editorial-label">Kazka</p>
            <h1 className="text-4xl font-normal leading-10 whitespace-normal">
              {product.title}
            </h1>
          </div>
          <ProductOptions
            options={product.options}
            selectedVariant={selectedVariant}
          />
          {selectedVariant?.price ? (
            <Money
              withoutTrailingZeros
              data={selectedVariant.price}
              className="text-xl font-semibold mb-2"
            />
          ) : (
            <p className="text-xl font-semibold mb-2 text-black/50">
              Wybierz wariant, aby zobaczyć cenę.
            </p>
          )}
          {stoneLabel ? (
            <p className="text-sm text-[rgb(var(--color-primary))]/70">
              Kamień · {stoneLabel}
            </p>
          ) : null}
          {showPurchaseForm ? (
            <div className="space-y-2">
              {selectedVariant?.availableForSale === false ? (
                <p className="text-sm text-amber-900" role="status">
                  Weryfikujemy dostępność tego wariantu — jeśli „Do koszyka” nie zadziała,
                  wybierz inną konfigurację lub napisz na czacie.
                </p>
              ) : null}
              <ProductForm countryCode={countryCode} variantId={variantId} />
            </div>
          ) : null}
          <KazkaProductTrust items={trustItems} />
          {specHtml ? (
            <div className="kazka-pdp-description border-t border-gray-200 pt-6">
              <div
                className="prose text-black text-md"
                dangerouslySetInnerHTML={{__html: visibleHtml}}
                suppressHydrationWarning
              />
              <details className="mt-4">
                <summary className="kazka-editorial-label cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  Specyfikacja
                </summary>
                <div
                  className="prose text-black text-md pt-4"
                  dangerouslySetInnerHTML={{__html: specHtml}}
                  suppressHydrationWarning
                />
              </details>
            </div>
          ) : (
            <div
              className="kazka-pdp-description prose border-t border-gray-200 pt-6 text-black text-md"
              dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
              suppressHydrationWarning
            />
          )}
        </div>
      </div>
    </section>
  );
}

const PRODUCT_QUERY = `#graphql
  query product($handle: String!, $selectedOptions: [SelectedOptionInput!]!) {
    product(handle: $handle) {
      id
      title
      handle
      vendor
      productType
      tags
      description
      descriptionHtml
      seo {
        title
        description
      }
      featuredImage {
        id
        url
        altText
        width
        height
      }
      priceRange {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      stoneProfile: metafield(namespace: "custom", key: "stone_profile") {
        reference {
          ... on Metaobject {
            fields {
              key
              value
            }
          }
        }
      }
      glownyKamien: metafield(namespace: "custom", key: "glowny_kamien") {
        reference {
          ... on Metaobject {
            fields {
              key
              value
            }
          }
        }
      }
      mainStone: metafield(namespace: "custom", key: "main_stone") {
        value
      }
      media(first: 20) {
        nodes {
          __typename
          ... on MediaImage {
            id
            mediaContentType
            image {
              id
              url
              altText
              width
              height
            }
          }
          ... on Video {
            id
            mediaContentType
            previewImage {
              url
              altText
              width
              height
            }
            sources {
              mimeType
              url
              format
              height
              width
            }
          }
          ... on ExternalVideo {
            id
            mediaContentType
            embedUrl
            host
            previewImage {
              url
              altText
              width
              height
            }
          }
          ... on Model3d {
            id
            mediaContentType
            sources {
              mimeType
              url
            }
          }
        }
      }
      options {
        name,
        values
      }
      selectedVariant: variantBySelectedOptions(selectedOptions: $selectedOptions) {
        id
        availableForSale
        selectedOptions {
          name
          value
        }
        image {
          id
          url
          altText
          width
          height
        }
        price {
          amount
          currencyCode
        }
        compareAtPrice {
          amount
          currencyCode
        }
        sku
        title
        unitPrice {
          amount
          currencyCode
        }
        product {
          title
          handle
        }
      }
      variants(first: 250) {
        nodes {
          id
          title
          availableForSale
          price {
            currencyCode
            amount
          }
          compareAtPrice {
            currencyCode
            amount
          }
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;
