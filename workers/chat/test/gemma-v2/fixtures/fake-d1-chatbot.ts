export type CapturedMessageInsert = {
  session_id: string;
  role: string;
  content: string;
  storefront_id: string | null;
  channel: string | null;
  message_uid: string | null;
};

/**
 * Minimalny stub D1 przechwytujący INSERT INTO messages (SessionDO.persistMessageRow).
 */
export function makeFakeD1Chatbot() {
  const messageInserts: CapturedMessageInsert[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return null;
            },
            async run() {
              if (sql.includes('INSERT INTO messages')) {
                messageInserts.push({
                  session_id: String(args[0]),
                  role: String(args[1]),
                  content: String(args[2]),
                  storefront_id: args[7] != null ? String(args[7]) : null,
                  channel: args[8] != null ? String(args[8]) : null,
                  message_uid: args[9] != null ? String(args[9]) : null,
                });
              }
              return {success: true, meta: {}};
            },
            async all() {
              return {results: []};
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return {db, messageInserts};
}
