declare module '../../../scripts/shopify/epir-web-pixel-record.mjs' {
  export const EPIR_WEB_PIXEL_SETTINGS: {
    accountID: string;
    pixelEndpoint: string;
  };

  export function reconcileEpirWebPixel(
    graphql: (
      query: string,
      variables?: Record<string, unknown>,
    ) => Promise<{
      data?: {
        webPixel?: { id?: string; settings?: string } | null;
        webPixelCreate?: {
          userErrors?: Array<{ field?: string[] | string; message?: string; code?: string }>;
          webPixel?: { id?: string; settings?: string } | null;
        };
        webPixelUpdate?: {
          userErrors?: Array<{ field?: string[] | string; message?: string; code?: string }>;
          webPixel?: { id?: string; settings?: string } | null;
        };
      };
      errors?: Array<{ message?: string; field?: string[] | string; code?: string }>;
    }>,
    settings?: { accountID: string; pixelEndpoint: string },
  ): Promise<
    | { ok: true; action: 'created' | 'updated' | 'already_active'; id?: string }
    | { ok: false; error: string }
  >;
}
