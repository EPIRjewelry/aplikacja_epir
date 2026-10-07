declare module '../../../scripts/shopify/epir-web-pixel-record.mjs' {
  export function reconcileEpirWebPixel(
    adminGraphql: (
      query: string,
      variables?: Record<string, unknown>,
    ) => Promise<{
      data?: unknown;
      errors?: Array<{message?: string}>;
    }>,
  ): Promise<{ok: boolean; error?: string; action?: string; id?: string}>;
}
