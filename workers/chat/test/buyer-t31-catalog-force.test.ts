import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SessionDO} from '../src/index';
import {composeBuyerAssistantReply} from '../src/buyer/compose-buyer-turn';
import * as aiClient from '../src/ai-client';
import * as aiProfile from '../src/ai-profile';
import * as ex from '../src/buyer/execute-buyer-tool';
import * as facts from '../src/facts';
import * as sessionCart from '../src/buyer/session-cart';
import * as toolReadiness from '../src/buyer/tool-readiness';
import {makeDurableStateStub} from './helpers/session-do-sql-stub';

const ENV = {SHOP_DOMAIN: 'mock-shop.myshopify.com'} as import('../src/config/bindings').Env;
const CH = ['epir-online-store', 'epir-zareczyny'] as const;
const FACETS = {total: 0, byOrigin: {natural: 0, lab_grown: 0, cultured: 0, mixed: 0, unknown: 0}, byStone: {}, byMetal: {}, byProductType: {}};
let map = new Map<string, SessionDO>();

function bootDo() {
  map = new Map();
  ENV.SESSION_DO = {idFromName: (n: string) => n, get(id: string) {
    if (!map.has(id)) map.set(id, new SessionDO(makeDurableStateStub(id).state, {} as never));
    const i = map.get(id)!;
    return {fetch: (r: Request) => i.fetch(r)} as DurableObjectStub;
  }} as never;
}
function inst(sid: string) {
  if (!map.has(sid)) map.set(sid, new SessionDO(makeDurableStateStub(sid).state, {} as never));
  return map.get(sid)!;
}
const ap = (i: SessionDO, b: object) => i.fetch(new Request('https://session/append', {method: 'POST', body: JSON.stringify(b)}));
const txt = (t: string) => new ReadableStream({start(c) { c.enqueue({type: 'text', delta: t}); c.close(); }});
const catTool = () => new ReadableStream({start(c) {
  c.enqueue({type: 'tool_call', call: {id: '1', name: 'search_catalog', arguments: '{"query":"prezent"}'}}); c.close();
}});

function mockAll() {
  vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue(['search_catalog', 'ucp_cart']);
  vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);
  vi.spyOn(sessionCart, 'readSessionCartId').mockResolvedValue(null);
  const mk = (n: number, t: string) => ({
    product: {title: t, url: `https://epirbizuteria.pl/products/${t}`, handle: t, variants: []},
    matchingVariantIds: [], matchingVariants: [],
    matchingPriceRange: {min: {minor: n, display_pl: `${n / 100} zł`}, max: {minor: n, display_pl: `${n / 100} zł`}, isFlat: true}, isFlat: true,
  });
  vi.spyOn(facts, 'getCatalogRepository').mockResolvedValue({
    search: vi.fn().mockResolvedValue({matches: [mk(42000, 'c'), mk(29000, 'a'), mk(35000, 'b')], total: 3, facets: FACETS}),
  } as never);
}

async function turn(sid: string, channel: (typeof CH)[number], user: string, seed: object[], opts?: {productHandle?: string}) {
  const i = inst(sid);
  for (const row of seed) await ap(i, row);
  const forced: string[] = [];
  let n = 0;
  vi.spyOn(aiClient, 'streamGroqEvents').mockImplementation(async (_a, _b, _c, _d, _e, o) => {
    if (o?.toolChoice && typeof o.toolChoice === 'object') { forced.push(o.toolChoice.function.name); return catTool(); }
    return txt(n++ ? 'ok' : 'q');
  });
  vi.spyOn(aiClient, 'getGroqResponse').mockResolvedValue('x');
  let catalogJson = '';
  const {executeBuyerTool: real} = await vi.importActual<typeof ex>('../src/buyer/execute-buyer-tool');
  vi.spyOn(ex, 'executeBuyerTool').mockImplementation(async (input) => {
    const out = await real(input);
    if (input.name === 'search_catalog') catalogJson = out.content;
    return out;
  });
  await composeBuyerAssistantReply(ENV, channel, user, new Request('https://example.com'), {sessionId: sid, ...opts});
  return {forced, catalogJson};
}

describe.each(CH)('T31 (%s)', (channel) => {
  beforeEach(() => { vi.restoreAllMocks(); bootDo(); mockAll(); });
  it('forces search_catalog when last assistant had tool_calls []', async () => {
    const {forced, catalogJson} = await turn(`ok-${channel}`, channel, 'tanio', [
      {role: 'user', content: 'prezent żonie'},
      {role: 'assistant', content: 'Proszę doprecyzować.', tool_calls: []},
    ]);
    expect(forced).toContain('search_catalog');
    expect(catalogJson.indexOf('290 zł')).toBeLessThan(catalogJson.indexOf('420 zł'));
  });
  it('skips force when tool_calls field absent (legacy session)', async () => {
    const {forced} = await turn(`leg-${channel}`, channel, 'tanio', [
      {role: 'user', content: 'prezent'}, {role: 'assistant', content: 'Jaki styl?'},
    ]);
    expect(forced).not.toContain('search_catalog');
  });
  it('skips force when previous assistant had tool_calls', async () => {
    const {forced} = await turn(`kb-${channel}`, channel, 'prezent', [
      {role: 'user', content: 'wysyłka'},
      {role: 'assistant', content: 'Polityka.', tool_calls: [{type: 'function', function: {name: 'search_shop_policies_and_faqs'}}]},
    ]);
    expect(forced).not.toContain('search_catalog');
  });
});

it('skips force on PDP productHandle', async () => {
  vi.restoreAllMocks(); bootDo(); mockAll();
  vi.spyOn(facts, 'fetchProductFactsByHandle').mockResolvedValue({
    title: 'Ring', url: 'https://epirbizuteria.pl/products/ring-x', handle: 'ring-x',
    variants: [{variantId: 'gid://shopify/ProductVariant/1', price: {minor: 10000, display_pl: '100 zł'}}],
  } as never);
  const {forced} = await turn('pdp', 'epir-online-store', 'tanio', [
    {role: 'user', content: 'x'}, {role: 'assistant', content: 'pytanie', tool_calls: []},
  ], {productHandle: 'ring-x'});
  expect(forced).not.toContain('search_catalog');
});
