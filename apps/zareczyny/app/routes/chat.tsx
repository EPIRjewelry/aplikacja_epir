import {json, useLoaderData} from '@remix-run/react';
import type {LoaderArgs} from '@remix-run/cloudflare';
import {ChatWidget} from '~/components/ChatWidget';

export function meta() {
  return [
    {title: 'Czat – EPIR Art Jewellery'},
    {description: 'Czat z asystentem sklepu EPIR Art Jewellery.'},
  ];
}

const DEFAULT_CHAT_API_URL = 'https://epirbizuteria.pl/apps/assistant/chat';

export async function loader({context, request}: LoaderArgs) {
  const configuredChatApiUrl = context.env.CHAT_API_URL as string | undefined;
  const chatApiUrl =
    configuredChatApiUrl && configuredChatApiUrl.includes('/apps/assistant/chat')
      ? configuredChatApiUrl
      : DEFAULT_CHAT_API_URL;
  const cartId = await context.session.get('cartId');
  const brand = (context.env.BRAND as string) || 'zareczyny';

  return json({
    chatApiUrl,
    cartId,
    brand,
    storefrontId: 'zareczyny',
    channel: 'hydrogen-zareczyny',
  });
}

export default function ChatPage() {
  const {chatApiUrl, cartId, brand, storefrontId, channel} = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Czat z asystentem</h1>
      <p className="mb-8 text-gray-600">
        Zadaj pytanie o produkty lub usługi. Jesteśmy tu, aby pomóc.
      </p>
      <ChatWidget
        chatApiUrl={chatApiUrl}
        cartId={cartId}
        brand={brand}
        storefrontId={storefrontId}
        channel={channel}
      />
    </div>
  );
}
