interface Env {
  MARKETING: {
    probeAdsEnv(): Promise<Record<string, unknown>>;
    probeAdsCampaigns(): Promise<Record<string, unknown>>;
    auditPmaxListingGroups(args?: {
      campaignName?: string;
    }): Promise<Record<string, unknown>>;
    expandPmaxListingGroups(args?: {
      campaignName?: string;
      dryRun?: boolean;
      excludeBrand?: string;
    }): Promise<Record<string, unknown>>;
    setForestPremiumCampaignSuffix(args?: {
      campaignName?: string;
      dryRun?: boolean;
    }): Promise<Record<string, unknown>>;
    applySearchAdGroupUtmSuffixes(args?: {
      campaignName?: string;
      dryRun?: boolean;
    }): Promise<Record<string, unknown>>;
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    const action = u.searchParams.get('action') ?? 'audit';
    try {
      let result: Record<string, unknown>;
      if (action === 'probe') {
        result = await env.MARKETING.probeAdsEnv();
      } else if (action === 'campaigns') {
        result = await env.MARKETING.probeAdsCampaigns();
      } else if (action === 'audit') {
        result = await env.MARKETING.auditPmaxListingGroups({
          campaignName: u.searchParams.get('campaign') ?? 'Epir_Forest-Dark',
        });
      } else if (action === 'expand-dry') {
        result = await env.MARKETING.expandPmaxListingGroups({
          campaignName: u.searchParams.get('campaign') ?? 'Epir_Forest-Dark',
          dryRun: true,
        });
      } else if (action === 'expand') {
        result = await env.MARKETING.expandPmaxListingGroups({
          campaignName: u.searchParams.get('campaign') ?? 'Epir_Forest-Dark',
          dryRun: false,
        });
      } else if (action === 'forest-utm-dry') {
        result = await env.MARKETING.setForestPremiumCampaignSuffix({ dryRun: true });
      } else if (action === 'forest-utm') {
        result = await env.MARKETING.setForestPremiumCampaignSuffix({ dryRun: false });
      } else if (action === 'search-utm-dry') {
        result = await env.MARKETING.applySearchAdGroupUtmSuffixes({ dryRun: true });
      } else if (action === 'search-utm') {
        result = await env.MARKETING.applySearchAdGroupUtmSuffixes({ dryRun: false });
      } else {
        return new Response('unknown action', { status: 400 });
      }
      return Response.json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
  },
};
