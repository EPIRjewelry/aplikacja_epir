import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SessionDO} from '../src/index';
import {composeBuyerAssistantReply} from '../src/buyer/compose-buyer-turn';
import * as aiClient from '../src/ai-client';
import * as aiProfile from '../src/ai-profile';
import * as ex from '../src/buyer/execute-buyer-tool';
import * as facts from '../src/facts';
import * as sessionCart from '../src/buyer/session-cart';
import * as toolReadiness from '../src/buyer/tool-readiness';
import type {BuyerChannelId} from '../src/buyer/channel-switch';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

const ENV = {SHOP_DOMAIN: 'mock-shop.myshopify.com'} as import('../src/config/bindings').Env;
const CH = ['epir-online-store', 'epir-zareczyny'] as const;
const FACETS = {total: 0, byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0}, byStone: {}, byMetal: {}, byProductType: {}};
let sessionNs: DurableObjectNamespace;

function makeSessionNamespace() {
  const sessions = new Map<string, {instance: SessionDO}>();
  return {idFromName: (n: string) => n, get(id: string) {
    const key = String(id);
    let s = sessions.get(key);
    if (!s) { s = {instance: new SessionDO(makeDurableStateStub(key).state, {} as never)}; sessions.set(key, s); }
    return {fetch(input: RequestInfo | URL, init?: RequestInit) {
      const r = input instanceof Request ? input : new Request(new URL(String(input), 'https://session').toString(), init);
      return s!.instance.fetch(r);
    }} as DurableObjectStub;
  }} as unknown as DurableObjectNamespace;
}
const doStub = (sid: string) => sessionNs.get(sessionNs.idFromName(sid));
const txt = (t: string) => new ReadableStream({start(c) { c.enqueue({type: 'text', delta: t}); c.close(); }});
const catTool = () => new ReadableStream({start(c) {
  c.enqueue({type: 'tool_call', call: {id: '1', name: 'search_catalog', arguments: '{"query":"prezent"}'}}); c.close();
}});
async function lastAssist(sid: string) {
  const raw = await (await doStub(sid).fetch('https://session/history')).json() as {role?: string; tool_calls?: unknown}[];
  return [...raw].reverse().find((e) => e.role === 'assistant');
}
async function seed(sid: string, rows: object[]) {
  for (const row of rows) await doStub(sid).fetch('https://session/append', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(row)});
}
function mockAll() {
  vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['search_catalog', 'ucp_cart']);
  vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
  vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
  const mk = (n: number, t: string) => ({product: {title: t, url: `https://epirbizuteria.pl/products/${t}`, handle: t, variants: []},
    matchingVariantIds: [], matchingVariants: [], matchingPriceRange: {min: {minor: n, display_pl: `${n / 100} zł`}, max: {minor: n, display_pl: `${n / 100} zł`}, isFlat: true}, isFlat: true});
  vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({search: vi.fn().mockResolvedValue({matches: [mk(42000, 'c'), mk(29000, 'a'), mk(35000, 'b')], total: 3, facets: FACETS})} as never);
}
async function turn(sid: string, channel: BuyerChannelId, user: string, opts?: {productHandle?: string}) {
  const forced: string[] = []; let n = 0;
  vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(async (_a, _b, _c, _d, _e, o) => {
    if (o?.toolChoice && typeof o.toolChoice === 'object') { forced.push(o.toolChoice.function.name); return catTool(); }
    return txt(n++ ? 'ok' : 'q');
  });
  vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');
  let catalogJson = '';
  const {executeBuyerTool: real} = await vi.importActual<typeof ex>('../src/buyer/execute-buyer-tool');
  vi.spyOn(ex, 'executeBuyerTool').mockImplementation(async (input) => { const out = await real(input); if (input.name === 'search_catalog') catalogJson = out.content; return out; });
  await composeBuyerAssistantReply(ENV, channel, user, new Request('https://example.com'), {sessionId: sid, ...opts});
  return {forced, catalogJson};
}

describe.each(CH)('T31 (%s)', (channel) => {
  beforeEach(() => { vi.restoreAllMocks(); sessionNs = makeSessionNamespace(); ENV.SESSION_DO = sessionNs as never; mockAll(); });
  it('forces search_catalog when last assistant had tool_calls []', async () => {
    const sid = `ok-${channel}`;
    await seed(sid, [{role: 'user', content: 'prezent żonie'}, {role: 'assistant', content: 'Proszę doprecyzować.', tool_calls: []}]);
    expect((await lastAssist(sid))?.tool_calls).toEqual([]);
    const {forced, catalogJson} = await turn(sid, channel, 'tanio');
    expect(forced).toContain('search_catalog');
    expect(catalogJson.indexOf('290 zł')).toBeLessThan(catalogJson.indexOf('420 zł'));
  });
  it('skips force when tool_calls field absent (legacy session)', async () => {
    const sid = `leg-${channel}`;
    await seed(sid, [{role: 'user', content: 'prezent'}, {role: 'assistant', content: 'Jaki styl?'}]);
    const pre = await lastAssist(sid);
    expect(pre && !('tool_calls' in pre)).toBe(true);
    expect((await turn(sid, channel, 'tanio')).forced).not.toContain('search_catalog');
  });
  it('skips force when previous assistant had tool_calls', async () => {
    const sid = `kb-${channel}`;
    await seed(sid, [{role: 'user', content: 'wysyłka'}, {role: 'assistant', content: 'Polityka.', tool_calls: [{type: 'function', function: {name: 'search_shop_policies_and_faqs'}}]}]);
    expect((await lastAssist(sid))?.tool_calls).toEqual([{type: 'function', function: {name: 'search_shop_policies_and_faqs'}}]);
    expect((await turn(sid, channel, 'prezent')).forced).not.toContain('search_catalog');
  });
  it('no force after search_catalog already in session history', async () => {
    const sid = `thx-${channel}`;
    await seed(sid, [
      {role: 'user', content: 'prezent'},
      {role: 'assistant', content: 'Produkty.', tool_calls: [{type: 'function', function: {name: 'search_catalog'}}]},
      {role: 'user', content: 'ok'}, {role: 'assistant', content: 'Miło.', tool_calls: []},
    ]);
    expect((await turn(sid, channel, 'dziękuję')).forced).not.toContain('search_catalog');
  });
});

it('skips force on PDP productHandle', async () => {
  vi.restoreAllMocks(); sessionNs = makeSessionNamespace(); ENV.SESSION_DO = sessionNs as never; mockAll();
  vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue({title: 'Ring', url: 'https://epirbizuteria.pl/products/ring-x', handle: 'ring-x',
    variants: [{variantId: 'gid://shopify/ProductVariant/1', price: {minor: 10000, display_pl: '100 zł'}}]} as never);
  const sid = 'pdp';
  await seed(sid, [{role: 'user', content: 'x'}, {role: 'assistant', content: 'pytanie', tool_calls: []}]);
  expect((await lastAssist(sid))?.tool_calls).toEqual([]);
  expect((await turn(sid, 'epir-online-store', 'tanio', {productHandle: 'ring-x'})).forced).not.toContain('search_catalog');
});

it('skips force on kazka-hydrogen (GK)', async () => {
  vi.restoreAllMocks(); sessionNs = makeSessionNamespace(); ENV.SESSION_DO = sessionNs as never; mockAll();
  const sid = 'gk-t31';
  await seed(sid, [{role: 'user', content: 'prezent'}, {role: 'assistant', content: 'Pytanie.', tool_calls: []}]);
  expect((await lastAssist(sid))?.tool_calls).toEqual([]);
  expect((await turn(sid, 'kazka-hydrogen', 'tanio')).forced).not.toContain('search_catalog');
});
