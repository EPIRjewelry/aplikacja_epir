import {describe, expect, it} from 'vitest';
import {reconcileEpirWebPixel} from '../../../scripts/shopify/epir-web-pixel-record.mjs';

const SETTINGS = {
  accountID: 'epir',
  pixelEndpoint: 'https://asystent.epirbizuteria.pl',
};

type Call = {query: string; variables?: {webPixel?: {settings?: string}; id?: string}};

function settingsOf(call: Call | undefined) {
  const raw = call?.variables?.webPixel?.settings;
  if (!raw) return null;
  return JSON.parse(raw) as {accountID: string; pixelEndpoint: string};
}

describe('missing app web pixel', () => {
  it('calls webPixelCreate when the query says no web pixel was found', async () => {
    const calls: Call[] = [];
    const result = await reconcileEpirWebPixel(async (query, variables) => {
      calls.push({query, variables: variables as Call['variables']});
      if (query.includes('webPixelCreate')) {
        return {
          data: {
            webPixelCreate: {
              userErrors: [],
              webPixel: {id: 'gid://shopify/WebPixel/1'},
            },
          },
        };
      }
      if (query.includes('webPixelUpdate') || query.includes('webPixelDelete')) {
        throw new Error(`unexpected mutation: ${query}`);
      }
      return {
        errors: [{message: 'No web pixel was found for this app.'}],
        data: {webPixel: null},
      };
    });

    expect(result).toEqual({ok: true, action: 'created', id: 'gid://shopify/WebPixel/1'});
    expect(calls.map((call) => call.query.includes('webPixelCreate'))).toEqual([false, true]);
    expect(settingsOf(calls[1])).toEqual(SETTINGS);
    expect(calls.some((call) => call.query.includes('webPixelDelete'))).toBe(false);
  });

  it('updates an existing pixel instead of creating another', async () => {
    const calls: Call[] = [];
    const result = await reconcileEpirWebPixel(async (query, variables) => {
      calls.push({query, variables: variables as Call['variables']});
      if (query.includes('webPixelUpdate')) {
        return {
          data: {
            webPixelUpdate: {
              userErrors: [],
              webPixel: {id: 'gid://shopify/WebPixel/7'},
            },
          },
        };
      }
      if (query.includes('webPixelCreate') || query.includes('webPixelDelete')) {
        throw new Error(`unexpected mutation: ${query}`);
      }
      return {
        data: {
          webPixel: {
            id: 'gid://shopify/WebPixel/7',
            settings: JSON.stringify({accountID: 'old', pixelEndpoint: 'https://example.invalid'}),
          },
        },
      };
    });

    expect(result).toEqual({ok: true, action: 'updated', id: 'gid://shopify/WebPixel/7'});
    expect(calls).toHaveLength(2);
    expect(calls[1]?.query).toContain('webPixelUpdate');
    expect(calls[1]?.variables?.id).toBe('gid://shopify/WebPixel/7');
    expect(settingsOf(calls[1])).toEqual(SETTINGS);
  });
});
