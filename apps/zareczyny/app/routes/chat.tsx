import {json, useLoaderData} from '@remix-run/react';
import type {LoaderArgs} from '@remix-run/cloudflare';
import {ChatWidget} from '~/components/ChatWidget';
import {resolveChatApiUrl} from '~/lib/resolve-chat-api-url';

export function meta() {
  return [
    {title: 'Czat – EPIR Art Jewellery'},
    {description: 'Czat z asystentem sklepu EPIR Art Jewellery.'},
  ];
}

export async function loader({context, request}: LoaderArgs) {
  const configuredChatApiUrl = context.env.CHAT_API_URL as string | undefined;
  const chatApiUrl = resolveChatApiUrl(configuredChatApiUrl);
  const cartId = await context.session.get('cartId');
  const brand = (context.env.BRAND as string) || 'zareczyny';
  const route = new URL(request.url).pathname;

  return json({
    chatApiUrl,
    cartId,
    brand,
    storefrontId: 'zareczyny',
    channel: 'hydrogen-zareczyny',
    route,
  });
}

export default function ChatPage() {
  const {chatApiUrl, cartId, brand, storefrontId, channel, route} =
    useLoaderData<typeof loader>();

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
        route={route}
      />
    </div>
  );
}
