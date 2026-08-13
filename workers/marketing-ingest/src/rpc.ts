/// <reference types="@cloudflare/workers-types" />

import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './env';
import { buildMarketingPreviewBody, type MarketingPreviewBody } from './ops-preview';
import { yesterdayUtcDate } from './ga4';
import {
  applySearchAdGroupUtmSuffixes,
  auditPmaxListingGroups,
  expandPmaxListingGroups,
  expandPmaxListingGroupsSingleMetal,
  FOREST_UTM_SUFFIX,
  setAssetGroupStatus,
  setCampaignFinalUrlSuffix,
  type MetalLabel,
  type PmaxListingAudit,
} from './pmax-listing';
import {
  applyPmaxSearchThemes,
  auditPmaxSearchThemes,
  type SearchThemesAudit,
} from './pmax-search-themes';
import { auditSearchTerms, type SearchTermsAudit } from './ads-search-terms-audit';
import {
  applySearchNegatives,
  auditSearchNegatives,
} from './search-negatives';

/** S2S RPC — podgląd marketingu + ops PMax/Search bez HTTP Bearer między workerami. */
export class MarketingIngestS2SRpc extends WorkerEntrypoint<Env> {
  async getMarketingPreview(args?: { date?: string }): Promise<MarketingPreviewBody> {
    const raw = args?.date?.trim();
    const date =
      raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : yesterdayUtcDate();
    return buildMarketingPreviewBody(this.env, date);
  }

  async probeAdsCampaigns(): Promise<Record<string, unknown>> {
    const { adsCustomerId } = await import('./ads-api');
    const customerId = adsCustomerId(this.env);
    const loginCid = (this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
    const devTok = (this.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim();
    const cid = (this.env.GOOGLE_ADS_CLIENT_ID ?? '').trim();
    const sec = (this.env.GOOGLE_ADS_CLIENT_SECRET ?? '').trim();
    const rt = (this.env.GOOGLE_ADS_REFRESH_TOKEN ?? '').trim();
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: sec,
        refresh_token: rt,
        grant_type: 'refresh_token',
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return { ok: false, customerId, loginCid: loginCid || null, tokenError: tokenJson.error ?? tokenRes.status };
    }
    const accessibleRes = await fetch(
      'https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          'developer-token': devTok,
        },
      },
    );
    const accessibleText = await accessibleRes.text();
    let accessibleCustomers: string[] = [];
    if (accessibleRes.ok) {
      try {
        const parsed = JSON.parse(accessibleText) as { resourceNames?: string[] };
        accessibleCustomers = (parsed.resourceNames ?? []).map((r) => r.replace('customers/', ''));
      } catch {
        /* ignore */
      }
    }
    const query = 'SELECT campaign.id, campaign.name FROM campaign LIMIT 5';
    const attempts: Array<Record<string, unknown>> = [];
    const combos: Array<{ customer: string; login?: string; label: string }> = [
      { customer: customerId, login: loginCid || undefined, label: 'client+login' },
      { customer: customerId, label: 'client-only' },
    ];
    if (loginCid && loginCid !== customerId) {
      combos.push({ customer: loginCid, label: 'mcc-only' });
      combos.push({ customer: loginCid, login: loginCid, label: 'mcc+login-self' });
    }
    for (const combo of combos) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'developer-token': devTok,
        'Content-Type': 'application/json',
      };
      if (combo.login) headers['login-customer-id'] = combo.login;
      const res = await fetch(
        `https://googleads.googleapis.com/v25/customers/${combo.customer}/googleAds:search`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ query }),
        },
      );
      const text = await res.text();
      attempts.push({
        label: combo.label,
        customer: combo.customer,
        login: combo.login ?? null,
        status: res.status,
        body: text.slice(0, 1200),
        requestId: res.headers.get('request-id'),
        grpcMessage: res.headers.get('grpc-message'),
      });
      if (res.ok) {
        let data: { results?: unknown[] } = {};
        try {
          data = JSON.parse(text) as { results?: unknown[] };
        } catch {
          /* ignore */
        }
        return {
          ok: true,
          customerId: combo.customer,
          loginCid: combo.login ?? null,
          label: combo.label,
          campaigns: data.results ?? [],
        };
      }
    }
    return {
      ok: false,
      customerId,
      loginCid: loginCid || null,
      accessibleCustomers,
      accessibleStatus: accessibleRes.status,
      accessibleBody: accessibleText.slice(0, 800),
      attempts,
    };
  }

  async auditPmaxListingGroups(args?: {
    campaignName?: string;
  }): Promise<PmaxListingAudit | { error: string }> {
    return auditPmaxListingGroups(this.env, args?.campaignName);
  }

  async expandPmaxListingGroups(args?: {
    campaignName?: string;
    dryRun?: boolean;
    excludeBrand?: string;
  }): Promise<Record<string, unknown>> {
    return expandPmaxListingGroups(this.env, args);
  }

  async expandPmaxListingGroupsSingleMetal(args: {
    campaignName?: string;
    assetGroupName: string;
    metal: MetalLabel | string;
    dryRun?: boolean;
    excludeBrand?: string;
  }): Promise<Record<string, unknown>> {
    return expandPmaxListingGroupsSingleMetal(this.env, args);
  }

  async setAssetGroupStatus(args: {
    campaignName?: string;
    assetGroupName: string;
    status: 'ENABLED' | 'PAUSED';
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return setAssetGroupStatus(this.env, args);
  }

  async setForestPremiumCampaignSuffix(args?: {
    campaignName?: string;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return setCampaignFinalUrlSuffix(this.env, {
      campaignName: args?.campaignName ?? 'Epir_Forest-Dark',
      finalUrlSuffix: FOREST_UTM_SUFFIX,
      dryRun: args?.dryRun,
    });
  }

  async applySearchAdGroupUtmSuffixes(args?: {
    campaignName?: string;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return applySearchAdGroupUtmSuffixes(this.env, args);
  }

  async auditPmaxSearchThemes(args?: {
    campaignName?: string;
    assetGroupName?: string;
  }): Promise<SearchThemesAudit | { error: string }> {
    return auditPmaxSearchThemes(this.env, args);
  }

  async applyPmaxSearchThemes(args?: {
    campaignName?: string;
    assetGroupName?: string;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return applyPmaxSearchThemes(this.env, args);
  }

  async auditSearchTerms(args?: {
    days?: number;
    campaignNameContains?: string;
    limit?: number;
  }): Promise<SearchTermsAudit | { error: string }> {
    return auditSearchTerms(this.env, args);
  }

  async auditSearchNegatives(args?: {
    campaignFilter?: string;
  }): Promise<Record<string, unknown>> {
    return auditSearchNegatives(this.env, args);
  }

  async applySearchNegatives(args?: {
    campaignFilter?: string;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return applySearchNegatives(this.env, args);
  }

  /** Diagnostics — lengths only, no secret values. */
  async probeAdsEnv(): Promise<Record<string, unknown>> {
    const e = this.env;
    const cid = (e.GOOGLE_ADS_CLIENT_ID ?? '').trim();
    return {
      clientIdLen: cid.length,
      clientIdSuffix: cid.slice(-24),
      clientSecretLen: (e.GOOGLE_ADS_CLIENT_SECRET ?? '').trim().length,
      refreshLen: (e.GOOGLE_ADS_REFRESH_TOKEN ?? '').trim().length,
      refreshSuffix: (e.GOOGLE_ADS_REFRESH_TOKEN ?? '').trim().slice(-8),
      devTokLen: (e.GOOGLE_ADS_DEVELOPER_TOKEN ?? '').trim().length,
      customerIdDigits: (e.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '').trim().length,
      loginCidDigits: (e.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim().length,
      clientIdHasAppsDomain: (e.GOOGLE_ADS_CLIENT_ID ?? '').includes(
        '.apps.googleusercontent.com',
      ),
      merchantIdDigits: (e.GOOGLE_MERCHANT_ID ?? '').replace(/\D/g, '').trim().length,
      merchantClientIdLen: (e.GOOGLE_MERCHANT_CLIENT_ID ?? '').trim().length,
      merchantClientSecretLen: (e.GOOGLE_MERCHANT_CLIENT_SECRET ?? '').trim().length,
      merchantRefreshLen: (e.GOOGLE_MERCHANT_REFRESH_TOKEN ?? '').trim().length,
    };
  }
}
