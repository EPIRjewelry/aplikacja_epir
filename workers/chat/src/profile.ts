/**
 * ProfileService – Golden Record Pattern dla client_profiles
 * Skopiowane z Landing_pages/epir-ai-worker, dostosowane do TypeScript.
 * Używa DB_CHATBOT (env.DB_CHATBOT) dla tabeli client_profiles.
 *
 * Logika: Insert-or-Update z Optimistic Locking (last_seen).
 * Spójność z Landing_pages: ta sama logika merge, retry przy konflikcie.
 */

export interface ProfileUpdates {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  context?: unknown[];
  preferences?: Record<string, unknown>;
  scoreDelta?: number;
}

export interface UpdateProfileResult {
  status: 'created' | 'updated';
  lead_score: number;
}

export class ProfileService {
  constructor(private readonly db: D1Database) {}

  /**
   * Atomic Insert-or-Update using Optimistic Locking.
   * Handles "Cold Start" race conditions and JSON merging.
   */
  async updateProfile(clientId: string, updates: ProfileUpdates = {}): Promise<UpdateProfileResult> {
    const timestamp = Date.now();
    const {
      email,
      phone,
      firstName,
      context = [],
      preferences = {},
    } = updates;

    // 1. Try Atomic Insert (New Guest)
    try {
      if (!clientId) throw new Error('Missing Client ID');

      const insertQuery = `
        INSERT INTO client_profiles (
          client_id, created_at, last_seen,
          email, phone, first_name,
          ai_context, preferences
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.db
        .prepare(insertQuery)
        .bind(
          clientId,
          timestamp,
          timestamp,
          email ?? null,
          phone ?? null,
          firstName ?? null,
          JSON.stringify(context),
          JSON.stringify(preferences)
        )
        .run();

      return { status: 'created', lead_score: 0 };
    } catch (e) {
      const err = e as Error;
      // 2. Fallback to Update (Existing Guest)
      if (err.message?.includes('UNIQUE constraint failed')) {
        return await this.mergeAndUpdate(clientId, updates, timestamp);
      }
      throw e;
    }
  }

  /**
   * Smart Merge for existing profiles.
   * Uses Optimistic Locking to avoid overwriting parallel requests.
   */
  private async mergeAndUpdate(
    clientId: string,
    updates: ProfileUpdates,
    now: number
  ): Promise<UpdateProfileResult> {
    // A. Fetch current state (Warm Layer)
    const current = await this.db
      .prepare(`SELECT * FROM client_profiles WHERE client_id = ?`)
      .bind(clientId)
      .first<{
        ai_context: string | null;
        email: string | null;
        lead_score: number | null;
        last_seen: number;
      }>();

    if (!current) throw new Error('Profile disappeared (Race condition)');

    // B. Merge Logic
    const mergedContext = this.mergeLists(
      JSON.parse(current.ai_context || '[]') as unknown[],
      updates.context || []
    );

    const email = updates.email ?? current.email;
    const leadScore = Math.min(
      100,
      (current.lead_score ?? 0) + (updates.scoreDelta ?? 0)
    );

    // C. Atomic Update with Optimistic Lock
    const updateQuery = `
      UPDATE client_profiles
      SET
        last_seen = ?,
        email = ?,
        lead_score = ?,
        ai_context = ?,
        total_sessions = total_sessions + 1
      WHERE client_id = ?
      AND last_seen = ?
    `;

    const result = await this.db
      .prepare(updateQuery)
      .bind(
        now,
        email,
        leadScore,
        JSON.stringify(mergedContext),
        clientId,
        current.last_seen
      )
      .run();

    // D. Retry on Lock Failure
    if (result.meta.changes === 0) {
      console.warn(`Optimistic Lock failed for ${clientId}. Retrying...`);
      return this.updateProfile(clientId, updates);
    }

    return { status: 'updated', lead_score: leadScore };
  }

  /**
   * Merges AI Context arrays (newest wins, keep unique, limit 20).
   */
  private mergeLists(existing: unknown[], incoming: unknown[]): unknown[] {
    const combined = [...incoming, ...existing];
    const seen = new Set<string>();
    const result: unknown[] = [];

    for (const item of combined) {
      const key = typeof item === 'string' ? item : JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result.slice(0, 20);
  }
}
