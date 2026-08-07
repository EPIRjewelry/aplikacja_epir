import {Link} from '@remix-run/react';
import {ProductCard} from '@epir/ui';
import type {
  CampaignLandingData,
  CampaignLandingProduct,
} from '~/lib/campaign-landing.server';

type CampaignLandingPageProps = {
  landing: CampaignLandingData;
  products: CampaignLandingProduct[];
};

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function CampaignLandingPage({landing, products}: CampaignLandingPageProps) {
  const ctaUrl = landing.ctaUrl?.trim();
  const ctaLabel = landing.ctaLabel?.trim();

  return (
    <div className="w-full">
      <div className="text-center mb-10 md:mb-14 fadeIn">
        <h1 className="text-3xl md:text-5xl font-bold text-[rgb(var(--color-primary))] mb-4 tracking-tight">
          {landing.heroTitle}
        </h1>
        {landing.heroSubtitle ? (
          <p className="text-[rgb(var(--color-primary))]/70 max-w-2xl mx-auto text-sm md:text-base font-light whitespace-pre-line">
            {landing.heroSubtitle}
          </p>
        ) : null}
        {ctaUrl && ctaLabel ? (
          <div className="mt-8">
            {isExternalUrl(ctaUrl) ? (
              <a
                href={ctaUrl}
                className="inline-block rounded font-medium text-center py-3 px-8 bg-[rgb(var(--color-primary))] text-white hover:opacity-90 transition-opacity"
                target="_blank"
                rel="noopener noreferrer"
              >
                {ctaLabel}
              </a>
            ) : (
              <Link
                to={ctaUrl}
                className="inline-block rounded font-medium text-center py-3 px-8 bg-[rgb(var(--color-primary))] text-white hover:opacity-90 transition-opacity"
              >
                {ctaLabel}
              </Link>
            )}
          </div>
        ) : null}
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
