import {json, redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction, useLoaderData} from '@remix-run/react';
import {ProductGallery, ProductOptions, ProductForm} from '@epir/ui';
import {getSeoMeta, Money} from '@shopify/hydrogen';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {buildProductJsonLd} from '~/lib/product-json-ld';

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

export default function ProductHandle() {
  const {product, selectedVariant, countryCode} = useLoaderData<typeof loader>();
  const variantId = selectedVariant?.id;
  const hasPrice = Boolean(selectedVariant?.price?.amount);
  const showPurchaseForm = Boolean(variantId && hasPrice);

  return (
    <section className="w-full gap-4 md:gap-8 grid px-6 md:px-8 lg:px-12">
      <div className="grid items-start gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductGallery
            medias={product.media.nodes}
            videoPlayback="mp4"
          />
        </div>
        <div className="md:sticky md:mx-auto max-w-xl md:max-w-[24rem] grid gap-8 p-0 md:p-6 md:px-0 top-[6rem] lg:top-[8rem] xl:top-[10rem]">
          <div className="grid gap-2">
            <h1 className="text-4xl font-bold leading-10 whitespace-normal">
              {product.title}
            </h1>
            <span className="max-w-prose whitespace-pre-wrap inherit text-copy opacity-50 font-medium">
              {product.vendor}
            </span>
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
          {showPurchaseForm ? (
            <div className="space-y-2">
              {selectedVariant?.availableForSale === false ? (
                <p className="text-sm text-amber-900" role="status">
                  Weryfikujemy dostępność tego wariantu — jeśli „Do koszyka” nie zadziała,
                  wybierz inną konfigurację lub napisz na czacie.
                </p>
              ) : null}
              <ProductForm
                countryCode={countryCode}
                variantId={variantId}
                showBuyNow
              />
            </div>
          ) : null}
          <div
            className="prose border-t border-gray-200 pt-6 text-black text-md"
            dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
            suppressHydrationWarning
          ></div>
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
