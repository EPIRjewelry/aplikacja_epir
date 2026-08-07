import {redirect, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {
  fetchCampaignMapping,
  resolveCampaignRedirect,
} from '~/lib/campaign-landing.server';

export async function loader({context, request}: LoaderFunctionArgs) {
  const mapping = await fetchCampaignMapping(context.storefront);
  const redirectTo = resolveCampaignRedirect(request.url, mapping, {
    allowDefault: true,
  });

  if (!redirectTo) {
    return redirect('/', 302);
  }

  return redirect(redirectTo, 302);
}
