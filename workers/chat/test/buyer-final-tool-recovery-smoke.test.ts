/**
 * Manual smoke (GK / kazka-hydrogen): finalna runda tool_choice none + failed_generation.
 * Uruchom: npm run smoke:buyer-final-recovery -w epir-art-jewellery-worker
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as aiClient from '../src/ai-client';
import * as aiProfile from '../src/ai-profile';
import * as channelSwitch from '../src/buyer/channel-switch';
import * as executeBuyerToolMod from '../src/buyer/execute-buyer-tool';
import { handleBuyerTurn } from '../src/buyer/handle-buyer-turn';
import { readBuyerSessionHistory } from '../src/buyer/session-history';
import * as toolReadiness from '../src/buyer/tool-readiness';
import type { Env } from '../src/config/bindings';
import { SessionDO } from '../src/index';
import { makeDurableStateStub } from './helpers/session-do-sql-stub';

const SAMPLE_VARIANT_GID = 'gid://shopify/ProductVariant/ALLOWED_IN_FACTS';
const KAZKA_CONTINUE =
  'https://kazka-jewelry.com/cart/c/smoke-final-tool-recovery';

const ENGLISH_CLIENT_ERROR_RE =
  /\b(No reply from server|server error|Internal Server Error)\b/i;

function toolCallOnlyStream(
  name: string,
  id: string,
  args = '{}',
): ReadableStream<aiClient.GroqStreamEvent> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        type: 'tool_call',
        call: { id, name, arguments: args },
      });
      controller.close();
    },
  });
}

function makeSessionNamespace() {
  const sessions = new Map<string, { instance: SessionDO }>();
  const namespace = {
    idFromName(name: string) {
      return name;
    },
    get(id: string) {
      const key = String(id);
      let session = sessions.get(key);
      if (!session) {
        const durableState = makeDurableStateStub(key);
        session = { instance: new SessionDO(durableState.state, {} as never) };
        sessions.set(key, session);
      }
      return {
        fetch(input: RequestInfo | URL, init?: RequestInit) {
          const request =
            input instanceof Request
              ? input
              : new Request(new URL(String(input), 'https://session').toString(), init);
          return session!.instance.fetch(request);
        },
      } as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
  return { namespace };
}

function kazkaBrandLock() {
  return {
    brandKey: 'kazka',
    brand: 'kazka',
    storefrontId: 'hydrogen-kazka',
    channel: 'hydrogen-kazka',
    source: 'test' as const,
    side: 'kazka' as const,
  };
}

function postReq(body: Record<string, unknown>) {
  return new Request('https://asystent.epirbizuteria.pl/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://kazka-jewelry.com' },
    body: JSON.stringify(body),
  });
}

describe('smoke GK — final tool recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('create_cart z failed_generation wykonuje mutację, PL reply, historia w SessionDO', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const { namespace } = makeSessionNamespace();
    const env = {
      SESSION_DO: namespace,
      SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
      ALLOWED_ORIGINS: 'https://kazka-jewelry.com',
    } as Env;

    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
      'search_catalog',
      'get_size_table',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);

    const execSpy = vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockImplementation(
      async (input) => {
        if (input.name === 'create_cart') {
          return {
            content: JSON.stringify({ continue_url: KAZKA_CONTINUE }),
            cartMutationSucceeded: true,
            continueUrl: KAZKA_CONTINUE,
            sessionCartId: 'gid://shopify/Cart/smoke-gk',
          };
        }
        return { content: '{"products":[]}' };
      },
    );

    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_messages, _env, _tools, _sessionId, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_final') {
          throw new aiClient.GroqStreamError(
            'Tool choice is none, but model called a tool',
            JSON.stringify({
              name: 'create_cart',
              arguments: {
                line_items: [
                  {
                    item: { id: SAMPLE_VARIANT_GID },
                    quantity: 1,
                    selected_options: [{ name: 'Rozmiar', value: '16' }],
                  },
                ],
              },
            }),
          );
        }
        const round = String(timingLabel ?? '').replace('buyer_tool_loop_', '');
        return toolCallOnlyStream(
          'search_catalog',
          `gk-call-${round}`,
          '{"query":"pierścionek"}',
        );
      },
    );
    const groqSpy = vi.spyOn(aiClient, 'getGroqResponse');

    const body = {
      message: 'Proszę dodać rozmiar 16 do koszyka',
      session_id: 'sess_gk_smoke_final_recovery',
      channel: 'hydrogen-kazka',
    };
    const res = await handleBuyerTurn(postReq(body), env, kazkaBrandLock(), body);
    const json = (await res.json()) as { type?: string; reply?: string; session_id?: string };

    expect(res.status).toBe(200);
    expect(json.type).toBe('message');
    expect(typeof json.reply).toBe('string');
    expect(json.reply!.trim().length).toBeGreaterThan(0);
    expect(ENGLISH_CLIENT_ERROR_RE.test(json.reply ?? '')).toBe(false);
    expect(groqSpy).not.toHaveBeenCalled();
    expect(execSpy.mock.calls.some((c) => c[0].name === 'create_cart')).toBe(true);

    const history = await readBuyerSessionHistory(env, body.session_id);
    expect(history.some((h) => h.role === 'user' && h.content.includes('rozmiar 16'))).toBe(
      true,
    );
    expect(
      history.some((h) => h.role === 'assistant' && (h.content.includes('koszyk') || h.content.includes(KAZKA_CONTINUE))),
    ).toBe(true);
  });

  it('get_cart z failed_generation — odzyskanie bez angielskiego błędu', async () => {
    vi.spyOn(channelSwitch, 'readChannelMode').mockResolvedValue('on');
    const { namespace } = makeSessionNamespace();
    const env = {
      SESSION_DO: namespace,
      SHOP_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
      ALLOWED_ORIGINS: 'https://kazka-jewelry.com',
    } as Env;

    vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([
      'ucp_cart',
      'search_catalog',
    ]);
    vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);

    const execSpy = vi.spyOn(executeBuyerToolMod, 'executeBuyerTool').mockImplementation(
      async (input) => {
        if (input.name === 'get_cart') {
          return {
            content: JSON.stringify({
              continue_url: KAZKA_CONTINUE,
              line_items: [],
            }),
          };
        }
        return { content: '{"products":[]}' };
      },
    );

    vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(
      async (_m, _e, _t, _s, timingLabel) => {
        if (timingLabel === 'buyer_tool_loop_final') {
          throw new aiClient.GroqStreamError(
            'Tool choice is none, but model called a tool',
            JSON.stringify({ name: 'get_cart', arguments: {} }),
          );
        }
        if (timingLabel === 'buyer_tool_loop_final_recover') {
          return new ReadableStream({
            start(c) {
              c.enqueue({
                type: 'text',
                delta: 'Oto stan koszyka po odzyskaniu narzędzia.',
              });
              c.close();
            },
          });
        }
        const round = String(timingLabel ?? '').replace('buyer_tool_loop_', '');
        return toolCallOnlyStream('search_catalog', `gk-get-${round}`, '{"query":"naszyjnik"}');
      },
    );

    const body = {
      message: 'Co jest w koszyku?',
      session_id: 'sess_gk_smoke_get_cart',
      channel: 'hydrogen-kazka',
    };
    const res = await handleBuyerTurn(postReq(body), env, kazkaBrandLock(), body);
    const json = (await res.json()) as { type?: string; reply?: string };

    expect(res.status).toBe(200);
    expect(json.type).toBe('message');
    expect(ENGLISH_CLIENT_ERROR_RE.test(json.reply ?? '')).toBe(false);
    expect(execSpy.mock.calls.some((c) => c[0].name === 'get_cart')).toBe(true);

    const history = await readBuyerSessionHistory(env, body.session_id);
    expect(history.some((h) => h.role === 'assistant')).toBe(true);
  });
});
