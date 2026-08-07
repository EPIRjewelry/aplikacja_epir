import {json, type HeadersFunction, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction, useLoaderData} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';
import {CampaignLandingPage} from '~/components/CampaignLandingPage';
import {canonicalUrlFromRequest} from '~/lib/canonical-url.server';
import {
  campaignLandingCacheHeaders,
  loadCampaignLanding,
} from '~/lib/campaign-landing.server';

export const headers: HeadersFunction = ({loaderHeaders}) => ({
  'Cache-Control':
    loaderHeaders.get('Cache-Control') ??
    'public, max-age=60, stale-while-revalidate=600',
});

export async function loader({context, params, request}: LoaderFunctionArgs) {
  const handle = params.handle?.trim();
  if (!handle) {
    throw new Response(null, {status: 404});
  }

  const metaobjectType =
    context.env.PUBLIC_CAMPAIGN_LANDING_TYPE ?? undefined;

  const result = await loadCampaignLanding(context.storefront, handle, {
    metaobjectType,
  });
  if (!result) {
    throw new Response(null, {status: 404});
  }

  return json(
    {
      ...result,
      canonicalUrl: canonicalUrlFromRequest(request, context.env),
    },
    {headers: campaignLandingCacheHeaders()},
  );
}

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.landing) {
    return [];
  }
  return getSeoMeta({
    title: data.landing.heroTitle,
    description: data.landing.heroSubtitle ?? undefined,
    url: data.canonicalUrl,
  });
};

export default function CampaignLandingRoute() {
  const {landing, products} = useLoaderData<typeof loader>();
  return <CampaignLandingPage landing={landing} products={products} />;
}
