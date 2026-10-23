import {vi} from 'vitest';

/** Stub zależności LLM/MCP tak, by prawdziwy composeBuyerAssistantReply zwrócił sam tekst. */
export async function stubBuyerComposeDeps(replyText = 'odpowiedź fikcyjna testowa E0') {
  const ai = await import('../../../src/ai-client');
  vi.spyOn(ai, 'getGroqResponse').mockResolvedValue(replyText);
  vi.spyOn(ai, 'streamGroqEvents').mockImplementation(async function* () {
    yield {type: 'text' as const, delta: replyText};
  });

  const toolReadiness = await import('../../../src/buyer/tool-readiness');
  vi.spyOn(toolReadiness, 'listAvailableBuyerTools').mockResolvedValue([]);

  const aiProfile = await import('../../../src/ai-profile');
  vi.spyOn(aiProfile, 'fetchAIProfileByHandle').mockResolvedValue(null);

  const facts = await import('../../../src/facts');
  vi.spyOn(facts, 'getCatalogRepository').mockRejectedValue(new Error('skip'));

  const prev = await import('../../../src/buyer/previous-response-products');
  vi.spyOn(prev, 'buildPreviousResponseProductsBlock').mockResolvedValue({
    block: '',
    variantIds: [],
    urls: [],
    products: [],
  });
}
