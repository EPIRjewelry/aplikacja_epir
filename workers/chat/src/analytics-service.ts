/**
 * AnalyticsService – getHotLeads, getDailyStats
 * Przeniesione z Landing_pages/epir-ai-worker.
 * Używa DB_CHATBOT (client_profiles).
 */

export interface HotLead {
  client_id: string;
  lead_score: number;
  last_seen: number;
  ai_context: string | null;
  ring_size?: string | null;
  preferred_metal?: string | null;
  purchase_intent?: string;
}

export interface DailyStats {
  total_visitors: number;
  qualified_leads: number;
  avg_engagement: number;
}

export class AnalyticsService {
  constructor(private readonly db: D1Database) {}

  /**
   * Gorące leady – goście z lead_score > 0, sortowani po score i ostatniej aktywności.
   */
  async getHotLeads(limit = 20): Promise<HotLead[]> {
    const result = await this.db
      .prepare(
        `SELECT client_id, lead_score, last_seen, ai_context
         FROM client_profiles
         WHERE lead_score > 0
         ORDER BY lead_score DESC, last_seen DESC
         LIMIT ?`
      )
      .bind(limit)
      .all();

    return (result.results || []).map((row: any) => {
      let contextArray: unknown[] = [];
      try {
        if (typeof row.ai_context === 'string') contextArray = JSON.parse(row.ai_context);
      } catch {
        // ignore
      }

      return {
        ...row,
        ring_size: this.extractFromContext(contextArray, 'rozmiar'),
        preferred_metal: this.extractFromContext(contextArray, 'złoto', 'srebro'),
        purchase_intent: (row.lead_score as number) > 50 ? 'High' : 'Medium',
      } as HotLead;
    });
  }

  private extractFromContext(context: unknown[], ...keywords: string[]): string | null {
    if (!Array.isArray(context)) return null;
    for (const item of context) {
      const str =
        typeof item === 'string' ? item.toLowerCase() : JSON.stringify(item).toLowerCase();
      for (const kw of keywords) {
        if (str.includes(kw.toLowerCase())) return kw;
      }
    }
    return null;
  }

  /**
   * Statystyki z ostatnich 24h.
   */
  async getDailyStats(): Promise<DailyStats> {
    const oneDayAgo = Date.now() - 86400000;

    const row = await this.db
      .prepare(
        `SELECT
          COUNT(*) as total_visitors,
          SUM(CASE WHEN lead_score > 20 THEN 1 ELSE 0 END) as qualified_leads,
          AVG(lead_score) as avg_engagement
         FROM client_profiles
         WHERE last_seen > ?`
      )
      .bind(oneDayAgo)
      .first();

    if (!row) {
      return { total_visitors: 0, qualified_leads: 0, avg_engagement: 0 };
    }

    return {
      total_visitors: Number(row.total_visitors ?? 0),
      qualified_leads: Number(row.qualified_leads ?? 0),
      avg_engagement: Number(row.avg_engagement ?? 0),
    };
  }
}
