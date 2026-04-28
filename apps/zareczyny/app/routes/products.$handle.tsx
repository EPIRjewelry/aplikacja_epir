import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction, useLoaderData} from '@remix-run/react';
import {ProductGallery, ProductOptions, ProductForm} from '@epir/ui';
import {getSeoMeta, Money, ShopPayButton} from '@shopify/hydrogen';
import React, {useEffect, useState} from 'react';

export async function loader({
  params,
  context,
  request,
}: LoaderFunctionArgs) {
  const {handle} = params;
  const searchParams = new URL(request.url).searchParams;
  const selectedOptions: {name: string; value: string}[] = [];

  const storeDomain = context.storefront.getShopifyDomain();

  // set selected options from the query string
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

  // optionally set a default variant so you always have an "orderable" product selected
  const selectedVariant =
    product.selectedVariant ?? product?.variants?.nodes[0];
  const shopPayEnabled =
    String(context.env.SHOP_PAY_ENABLED ?? '')
      .trim()
      .toLowerCase() === 'true';
  return json({
    product,
    selectedVariant,
    storeDomain,
    shopPayEnabled,
    countryCode: context.storefront.i18n.country,
    canonicalUrl: request.url,
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
  });
};

export default function ProductHandle() {
  const {product, selectedVariant, storeDomain, shopPayEnabled, countryCode} =
    useLoaderData<typeof loader>();
  const variantId = selectedVariant?.id;
  const orderable = Boolean(selectedVariant?.availableForSale && variantId);

  return (
    <section className="w-full gap-4 md:gap-8 grid px-6 md:px-8 lg:px-12">
      <div className="grid items-start gap-6 lg:gap-20 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductGallery medias={product.media?.nodes ?? []} />
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
          {orderable && (
            <div className="space-y-2">
              {shopPayEnabled ? (
                <ShopPayAfterMount
                  storeDomain={storeDomain}
                  variantIds={variantId ? [variantId] : []}
                  width="400px"
                />
              ) : null}
              <ProductForm
                countryCode={countryCode}
                variantId={variantId}
                showBuyNow
              />
            </div>
          )}
          {product.descriptionHtml ? (
            <div
              className="prose border-t border-gray-200 pt-6 text-black text-md"
              dangerouslySetInnerHTML={{__html: product.descriptionHtml}}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

type ShopPayAfterMountProps = {
  storeDomain: string;
  variantIds: string[];
  width: string;
};

/**
 * Shop Pay wstrzykuje mark-up inny niż w SSR – często wywołuje React #418.
 * Pierwszy render (serwer + hydratacja) = pusty slot o stałym rozmiarze, sam przycisk po `useEffect`.
 */
function ShopPayAfterMount({storeDomain, variantIds, width}: ShopPayAfterMountProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  if (!ready) {
    return (
      <div
        className="w-full min-h-[48px] max-w-[400px] rounded-md bg-gray-100"
        aria-hidden
      />
    );
  }
  return (
    <ShopPayButton
      storeDomain={storeDomain}
      variantIds={variantIds}
      width={width}
    />
  );
}

const PRODUCT_QUERY = `#graphql
  query product($handle: String!, $selectedOptions: [SelectedOptionInput!]!) {
    product(handle: $handle) {
      id
      title
      handle
      vendor
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
      media(first: 10) {
        nodes {
        __typename
          ... on MediaImage {
            mediaContentType
            image {
              id
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
      variants(first: 1) {
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
