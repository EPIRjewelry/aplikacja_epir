import {useLoaderData} from '@remix-run/react';
import type {MetaFunction} from '@remix-run/react';
import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {ChatWidget} from '~/components/ChatWidget';
import {resolveChatApiUrl} from '~/lib/resolve-chat-api-url';
import {KAZKA_CHANNEL, KAZKA_STOREFRONT_ID} from '~/lib/chat-widget-context';
import {loadKazkaPersonaUi} from '~/lib/persona-ui.server';

export const meta: MetaFunction<typeof loader> = ({data}) => {
  const name = data?.personaUi?.displayName ?? 'EPIR Art Jewellery';
  return [
    {title: `Czat – ${name} · EPIR Art Jewellery`},
    {
      description: `Rozmowa z ${name}, doradczynią EPIR Art Jewellery.`,
    },
  ];
};

export async function loader({context, request}: LoaderFunctionArgs) {
  const configuredChatApiUrl = context.env.CHAT_API_URL as string | undefined;
  const chatApiUrl = resolveChatApiUrl(configuredChatApiUrl);
  const cartId = await context.session.get('cartId');
  const brand = (context.env.BRAND as string) || 'kazka';
  const route = new URL(request.url).pathname;
  const personaUi = await loadKazkaPersonaUi(context.env);

  return json({
    chatApiUrl,
    cartId,
    brand,
    personaUi,
    storefrontId: KAZKA_STOREFRONT_ID,
    channel: KAZKA_CHANNEL,
    route,
  });
}

export default function ChatPage() {
  const {chatApiUrl, cartId, brand, personaUi, storefrontId, channel, route} =
    useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">{personaUi.chatTitle}</h1>
      <p className="mb-8 text-gray-600">
        Zadaj pytanie do {personaUi.displayName} o produkty lub usługi. Jesteśmy tu, aby pomóc.
      </p>
      <ChatWidget
        chatApiUrl={chatApiUrl}
        cartId={cartId}
        brand={brand}
        personaUi={personaUi}
        storefrontId={storefrontId}
        channel={channel}
        route={route}
      />
    </div>
  );
}
