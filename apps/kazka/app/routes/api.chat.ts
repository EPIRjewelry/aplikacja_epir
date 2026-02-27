/**
 * Chat API resource route – POST /api/chat
 * Mock echo bot. Architecture ready for LLM integration.
 */
import {json, type ActionArgs, type LoaderArgs} from '@remix-run/cloudflare';

type ChatRequestBody = {
  message: string;
  anonymousId?: string;
  cartId?: string;
};

type ChatResponseBody = {
  reply: string;
  suggestedProducts?: {id: string; title: string}[];
};

// TODO: Replace with real LLM (OpenAI, Anthropic, etc.) when integrating
function getMockReply(message: string): string {
  if (message.toLowerCase().includes('buty')) {
    return 'Polecam nasze najnowsze buty sportowe. Sprawdź kolekcję w dziale obuwie!';
  }
  return `Dziękuję za pytanie: ${message} (tu można podpiąć model AI)`;
}

// TODO: Replace with Storefront API product recommendations when integrating
const MOCK_SUGGESTED_PRODUCTS: {id: string; title: string}[] = [
  {id: 'gid://shopify/Product/1234567890', title: 'Przykładowy produkt 1'},
  {id: 'gid://shopify/Product/1234567891', title: 'Przykładowy produkt 2'},
];

export async function loader({request}: LoaderArgs) {
  if (request.method !== 'GET') {
    return json({error: 'Method not allowed'}, {status: 405});
  }
  return json({error: 'Use POST to send messages'}, {status: 405});
}

export async function action({request, context}: ActionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  let body: ChatRequestBody;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({error: 'Invalid JSON body'}, {status: 400});
  }

  const {message, anonymousId, cartId} = body;

  if (!message || typeof message !== 'string') {
    return json({error: 'message is required'}, {status: 400});
  }

  // Log for debugging (optional – remove in production if not needed)
  if (anonymousId) {
    // anonymousId can be used for session tracking
  }
  if (cartId) {
    // TODO: Use cartId with Storefront API for cart-aware recommendations
  }

  const reply = getMockReply(message);

  const response: ChatResponseBody = {
    reply,
    suggestedProducts: MOCK_SUGGESTED_PRODUCTS,
  };

  return json(response);
}
