import {Link} from '@remix-run/react';
import {Image, Money} from '@shopify/hydrogen';

type ProductVariant = {
  image?: {url?: string; altText?: string; width?: number; height?: number};
};

type ProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  productType?: string;
  variants?: {nodes?: ProductVariant[]};
  priceRange?: {minVariantPrice?: {amount?: string; currencyCode?: string}};
};

export type SectionFeaturedProductsProps = {
  type?: string;
  id?: string;
  heading?: {value?: string};
  body?: {value?: string};
  products?: {
    references?: {nodes?: ProductNode[]};
    nodes?: ProductNode[];
  };
  withProductPrices?: {value?: string};
  with_product_prices?: {value?: string};
};

export function SectionFeaturedProducts(props: SectionFeaturedProductsProps) {
  const {heading, body, products, withProductPrices, with_product_prices} = props;
  const nodes = products?.references?.nodes ?? products?.nodes ?? [];
  const priceField = withProductPrices ?? with_product_prices;
  const showPrices = priceField?.value === 'true' || priceField?.value === '1';

  return (
    <section className="w-full gap-8 py-12">
      {heading?.value && (
        <h2 className="text-3xl font-bold text-[rgb(var(--color-primary))] mb-4 text-center">
          {heading.value}
        </h2>
      )}
      {body?.value && (
        <p className="text-[rgb(var(--color-primary))]/70 max-w-2xl mx-auto mb-8 text-center">
          {body.value}
        </p>
      )}
      {nodes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {nodes.map((product, i) => {
            const variant = product.variants?.nodes?.[0];
            const price = product.priceRange?.minVariantPrice;
            return (
              <Link
                to={`/products/${product.handle}`}
                key={product.id ?? i}
                className="group"
              >
                <div className="grid gap-4 fadeIn">
                  <div className="card-image aspect-square bg-gray-100 overflow-hidden">
                      {variant?.image ? (
                      <Image
                        data={variant.image as any}
                        alt={product.title ?? ''}
                        className="w-full h-full object-cover"
                        sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                        width={400}
                        height={400}
                        loading={i < 4 ? 'eager' : 'lazy'}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        Brak zdjęcia
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1">
                    <h3 className="font-medium text-[rgb(var(--color-primary))] group-hover:opacity-80 transition-opacity truncate">
                      {product.title}
                    </h3>
                    {showPrices && price && (
                      <Money
                        withoutTrailingZeros
                        data={price as any}
                        className="font-semibold"
                      />
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
