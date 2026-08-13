/**
 * Shared negative keyword lists vs campaign attachments (Search + PMax).
 * Read-only. Explains "lists in library but traffic still leaks".
 */
import type { AdsEnv } from './ads';
import { adsCustomerId, adsMutate, adsSearch } from './ads-api';

const FOCUS_CAMPAIGNS = ['Epir_Forest-Dark', 'Search-27.04.2026'];

/** Frazy, które wg operatora / Safety Filter nie powinny zbierać kliknięć. */
export const LEAK_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'generic_jewelry', re: /^(biżuteria|bizuteria|jubiler|jubilo)\b/i },
  { label: 'mass_brand', re: /\b(apart|swarovski|pandora|briju|yes|apart)\b/i },
  { label: 'artisan_competitor', re: /\b(kopiszka|mokave|dwa\s*głosy|dwa\s*glosy)\b/i },
  { label: 'excluded_content', re: /\b(lego|peppa|roblox|skup\s*złota|skup\s*zlota)\b/i },
  { label: 'stone_filter', re: /\b(sułtanit|sultanit|mołdawit|moldawit)\b/i },
];

function str(v: unknown): string {
  return String(v ?? '').trim();
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function classifyLeakTerm(term: string): string | null {
  const t = term.trim();
  if (!t) return null;
  for (const p of LEAK_PATTERNS) {
    if (p.re.test(t)) return p.label;
  }
  return null;
}

export type SharedSetRow = {
  id: string;
  name: string;
  memberCount: number;
  status: string;
};

export type AttachmentRow = {
  campaignId: string;
  campaignName: string;
  channel: string;
  campaignStatus: string;
  sharedSetId: string;
  sharedSetName: string;
  attachmentStatus: string;
};

export async function auditSharedNegativeCoverage(env: AdsEnv): Promise<
  | {
      lists: SharedSetRow[];
      attachments: AttachmentRow[];
      focus: Array<{
        campaign: string;
        channel: string;
        status: string;
        attachedListNames: string[];
        missingListNames: string[];
      }>;
      adGroupNegatives: Array<{ campaign: string; adGroup: string; keyword: string; matchType: string }>;
      leaks7d: Array<{
        term: string;
        campaign: string;
        clicks: number;
        impressions: number;
        leak: string;
      }>;
    }
  | { error: string }
> {
  try {
    return await auditSharedNegativeCoverageInner(env);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function auditSharedNegativeCoverageInner(env: AdsEnv): Promise<
  | {
      lists: SharedSetRow[];
      attachments: AttachmentRow[];
      focus: Array<{
        campaign: string;
        channel: string;
        status: string;
        attachedListNames: string[];
        missingListNames: string[];
      }>;
      adGroupNegatives: Array<{ campaign: string; adGroup: string; keyword: string; matchType: string }>;
      leaks7d: Array<{
        term: string;
        campaign: string;
        clicks: number;
        impressions: number;
        leak: string;
      }>;
    }
  | { error: string }
> {
  const setsRes = await adsSearch(
    env,
    `
    SELECT shared_set.id, shared_set.name, shared_set.member_count, shared_set.status
    FROM shared_set
    WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
      AND shared_set.status != 'REMOVED'
    LIMIT 200
    `.trim(),
  );
  if (!setsRes.ok) return { error: `shared_set: ${setsRes.error}` };

  const lists: SharedSetRow[] = setsRes.results.map((r) => ({
    id: str(pick(r, ['sharedSet', 'id'])),
    name: str(pick(r, ['sharedSet', 'name'])),
    memberCount: num(pick(r, ['sharedSet', 'memberCount'])),
    status: str(pick(r, ['sharedSet', 'status'])),
  }));

  const attRes = await adsSearch(
    env,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.status,
      shared_set.id,
      shared_set.name,
      campaign_shared_set.status
    FROM campaign_shared_set
    WHERE shared_set.type = 'NEGATIVE_KEYWORDS'
      AND campaign_shared_set.status != 'REMOVED'
    LIMIT 500
    `.trim(),
  );
  if (!attRes.ok) return { error: `campaign_shared_set: ${attRes.error}` };

  const attachments: AttachmentRow[] = attRes.results.map((r) => ({
    campaignId: str(pick(r, ['campaign', 'id'])),
    campaignName: str(pick(r, ['campaign', 'name'])),
    channel: str(pick(r, ['campaign', 'advertisingChannelType'])),
    campaignStatus: str(pick(r, ['campaign', 'status'])),
    sharedSetId: str(pick(r, ['sharedSet', 'id'])),
    sharedSetName: str(pick(r, ['sharedSet', 'name'])),
    attachmentStatus: str(pick(r, ['campaignSharedSet', 'status'])),
  }));

  const agRes = await adsSearch(
    env,
    `
    SELECT
      campaign.name,
      ad_group.name,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type
    FROM ad_group_criterion
    WHERE ad_group_criterion.type = 'KEYWORD'
      AND ad_group_criterion.negative = TRUE
      AND campaign.advertising_channel_type = 'SEARCH'
      AND campaign.status != 'REMOVED'
    LIMIT 500
    `.trim(),
  );
  if (!agRes.ok) return { error: `ad_group_criterion: ${agRes.error}` };

  const adGroupNegatives = agRes.results.map((r) => ({
    campaign: str(pick(r, ['campaign', 'name'])),
    adGroup: str(pick(r, ['adGroup', 'name'])),
    keyword: str(pick(r, ['adGroupCriterion', 'keyword', 'text'])),
    matchType: str(pick(r, ['adGroupCriterion', 'keyword', 'matchType'])),
  }));

  const termsRes = await adsSearch(
    env,
    `
    SELECT
      search_term_view.search_term,
      campaign.name,
      metrics.clicks,
      metrics.impressions
    FROM search_term_view
    WHERE segments.date DURING LAST_7_DAYS
      AND campaign.advertising_channel_type = 'SEARCH'
      AND metrics.clicks > 0
    ORDER BY metrics.clicks DESC
    LIMIT 400
    `.trim(),
  );
  if (!termsRes.ok) return { error: `search_term_view: ${termsRes.error}` };

  const leaks7d: Array<{
    term: string;
    campaign: string;
    clicks: number;
    impressions: number;
    leak: string;
  }> = [];
  for (const r of termsRes.results) {
    const term = str(pick(r, ['searchTermView', 'searchTerm']));
    const leak = classifyLeakTerm(term);
    if (!leak) continue;
    leaks7d.push({
      term,
      campaign: str(pick(r, ['campaign', 'name'])),
      clicks: num(pick(r, ['metrics', 'clicks'])),
      impressions: num(pick(r, ['metrics', 'impressions'])),
      leak,
    });
  }

  const listNames = lists.map((l) => l.name);
  const campMeta = new Map<string, { channel: string; status: string }>();
  for (const a of attachments) {
    campMeta.set(a.campaignName, { channel: a.channel, status: a.campaignStatus });
  }

  const focus = FOCUS_CAMPAIGNS.map((campaign) => {
    const attached = attachments
      .filter((a) => a.campaignName === campaign)
      .map((a) => a.sharedSetName);
    const meta = campMeta.get(campaign);
    return {
      campaign,
      channel: meta?.channel ?? (campaign.includes('Forest') ? 'PERFORMANCE_MAX' : 'SEARCH'),
      status: meta?.status ?? 'UNKNOWN',
      attachedListNames: attached,
      missingListNames: listNames.filter((n) => !attached.includes(n)),
    };
  });

  return { lists, attachments, focus, adGroupNegatives, leaks7d };
}

export async function applySharedNegativeAttachments(
  env: AdsEnv,
  opts?: { dryRun?: boolean },
): Promise<Record<string, unknown>> {
  const dryRun = opts?.dryRun !== false;
  try {
    const audit = await auditSharedNegativeCoverageInner(env);
    if ('error' in audit) return { ok: false, error: audit.error };

    const campRes = await adsSearch(
      env,
      `
      SELECT campaign.id, campaign.name, campaign.resource_name, campaign.status,
        campaign.advertising_channel_type
      FROM campaign
      WHERE campaign.name IN ('${FOCUS_CAMPAIGNS.map((n) => n.replace(/'/g, "\\'")).join("','")}')
        AND campaign.status != 'REMOVED'
      LIMIT 20
      `.trim(),
    );
    if (!campRes.ok) return { ok: false, error: `campaigns: ${campRes.error}` };

    const campaigns = campRes.results.map((r) => ({
      id: str(pick(r, ['campaign', 'id'])),
      name: str(pick(r, ['campaign', 'name'])),
      resourceName: str(pick(r, ['campaign', 'resourceName'])),
      status: str(pick(r, ['campaign', 'status'])),
      channel: str(pick(r, ['campaign', 'advertisingChannelType'])),
    }));

    const customerId = adsCustomerId(env);
    const attached = new Set(
      audit.attachments.map((a) => `${a.campaignName}::${a.sharedSetName}`),
    );
    const plan: Array<{ campaign: string; list: string; sharedSetId: string; action: string }> = [];
    for (const camp of campaigns) {
      for (const list of audit.lists) {
        const key = `${camp.name}::${list.name}`;
        if (attached.has(key)) {
          plan.push({ campaign: camp.name, list: list.name, sharedSetId: list.id, action: 'already' });
          continue;
        }
        plan.push({ campaign: camp.name, list: list.name, sharedSetId: list.id, action: 'attach' });
      }
    }

    const missingCampaigns = FOCUS_CAMPAIGNS.filter((n) => !campaigns.some((c) => c.name === n));
    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        missingCampaigns,
        campaigns,
        lists: audit.lists,
        plan,
      };
    }

    const mutateResults: unknown[] = [];
    for (const camp of campaigns) {
      for (const list of audit.lists) {
        const key = `${camp.name}::${list.name}`;
        if (attached.has(key)) continue;
        const campaignRn =
          camp.resourceName || `customers/${customerId}/campaigns/${camp.id}`;
        const sharedSetRn = `customers/${customerId}/sharedSets/${list.id}`;
        const mutated = await adsMutate(env, 'campaignSharedSets:mutate', {
          operations: [
            {
              create: {
                campaign: campaignRn,
                sharedSet: sharedSetRn,
              },
            },
          ],
        });
        mutateResults.push({
          campaign: camp.name,
          list: list.name,
          mutate: mutated,
        });
        if (!mutated.ok) {
          return {
            ok: false,
            error: mutated.error,
            partialResults: mutateResults,
          };
        }
      }
    }

    const after = await auditSharedNegativeCoverageInner(env);
    return {
      ok: true,
      dryRun: false,
      mutateResults,
      after:
        'error' in after
          ? after
          : {
              lists: after.lists,
              focus: after.focus,
              attachmentCount: after.attachments.length,
            },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
