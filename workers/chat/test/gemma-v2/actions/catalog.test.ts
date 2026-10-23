/**
 * E4 catalog actions.
 * - **M-E4-1** — pomiń searchGemmaCatalog → T-E4-CAT-1 FAIL
 * - **M-E4-8** — legacy search_catalog z execute → T-E4-CAT-2 FAIL
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as catalogSearch from '../../../src/gemma/facts/catalog-search';
import {runCatalogAction} from '../../../src/gemma/actions/catalog';
import {fictionalMatchFromProduct, fictionalMultiVariantProduct} from '../fixtures/fictional-catalog-products';
import {DEFAULT_GEMMA_SESSION_STATE} from '../../../src/gemma/state/types';
import {fictionalGemmaIntent} from '../fixtures/gemma-intent';

describe('E4 catalog action', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('T-E4-CAT-1: propozycje path fills shown via searchGemmaCatalog', async () => {
    const match = fictionalMatchFromProduct(fictionalMultiVariantProduct());
    const spy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([match]);
    const ctx = {
      env: {} as never,
      channelId: 'epir-online-store' as const,
      request: new Request('https://example.com'),
      sessionId: 'sess_e4_cat_1',
      userText: 'fikcyjne',
      userCorpus: 'fikcyjne',
      intent: fictionalGemmaIntent({slots: {recipient: 'żona'}}),
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {
        nextState: 'propozycje' as const,
        slots: {recipient: 'żona'},
        allowedActions: ['search_catalog' as const],
      },
    };
    const out = await runCatalogAction(ctx);
    expect(spy).toHaveBeenCalled();
    expect(out.shown).toHaveLength(1);
    expect(out.shown[0].ref).toBe('g1');
  });

  it('T-E4-GE-GZ-1: GZ catalog uses searchGemmaCatalog on epir-zareczyny channel', async () => {
    const spy = vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const ctx = {
      env: {} as never,
      channelId: 'epir-zareczyny' as const,
      request: new Request('https://example.com'),
      sessionId: 'sess_e4_gz',
      userText: 'fikcyjne',
      userCorpus: 'fikcyjne',
      intent: fictionalGemmaIntent({slots: {recipient: 'partner'}}),
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {
        nextState: 'propozycje' as const,
        slots: {recipient: 'partner'},
        allowedActions: ['search_catalog' as const],
      },
    };
    await runCatalogAction(ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      'epir-zareczyny',
      expect.anything(),
      6,
      ctx.request,
      expect.anything(),
    );
  });

  it('T-E4-CAT-2: uses searchGemmaCatalog not executeBuyerTool search_catalog', async () => {
    const execute = await import('../../../src/buyer/execute-buyer-tool');
    const execSpy = vi.spyOn(execute, 'executeBuyerTool');
    vi.spyOn(catalogSearch, 'searchGemmaCatalog').mockResolvedValue([]);
    const ctx = {
      env: {} as never,
      channelId: 'epir-zareczyny' as const,
      request: new Request('https://example.com'),
      sessionId: 'sess_e4_cat_2',
      userText: 'fikcyjne',
      userCorpus: 'fikcyjne',
      intent: fictionalGemmaIntent(),
      prev: DEFAULT_GEMMA_SESSION_STATE,
      transitioned: {
        nextState: 'propozycje' as const,
        slots: {},
        allowedActions: ['search_catalog' as const],
      },
    };
    await runCatalogAction(ctx);
    expect(execSpy).not.toHaveBeenCalled();
  });
});
