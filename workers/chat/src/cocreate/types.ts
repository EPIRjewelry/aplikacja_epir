export type CocreateBriefFields = {
  name: string;
  email: string;
  phone: string | null;
  vision: string;
  jewelryType: string | null;
  metal: string | null;
  stone: string | null;
  occasion: string | null;
  budgetBand: string | null;
  timeline: string | null;
  ringSize: string | null;
  consentProject: boolean;
  consentMarketing: boolean;
  sourceUrl: string | null;
};

export type CocreatePersistedBrief = CocreateBriefFields & {
  referenceId: string;
  createdAt: number;
  storefrontId: string;
  channel: string;
  shopDomain: string | null;
  emailHash: string;
  briefJson: string;
  r2Key: string | null;
  r2ContentType: string | null;
  r2Bytes: number | null;
  userAgentTrunc: string | null;
};
