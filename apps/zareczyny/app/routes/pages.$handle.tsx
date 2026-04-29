import {json, type LoaderFunctionArgs} from '@remix-run/cloudflare';
import {type MetaFunction, useLoaderData} from '@remix-run/react';
import {getSeoMeta} from '@shopify/hydrogen';

const PAGE_QUERY = `#graphql
  query PageQuery($handle: String!) {
    page(handle: $handle) {
      title
      body
    }
  }
`;

type PageData = {
  title: string;
  body: string;
};

export async function loader({params, context, request}: LoaderFunctionArgs) {
  const handle = params.handle;
  if (!handle) {
    throw new Response(null, {status: 404});
  }

  const {page} = await context.storefront.query<{page: PageData | null}>(PAGE_QUERY, {
    variables: {handle},
  });

  if (!page) {
    throw new Response(null, {status: 404});
  }

  return json({
    page,
    canonicalUrl: request.url,
  });
}

export const meta: MetaFunction<typeof loader> = ({data}) => {
  if (!data?.page) {
    return [];
  }
  return getSeoMeta({
    title: data.page.title,
    url: data.canonicalUrl,
  });
};

export default function PageHandle() {
  const {page} = useLoaderData<typeof loader>();

  return (
    <article className="font-body mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading mb-8 text-3xl font-bold text-[rgb(var(--color-primary))]">
        {page.title}
      </h1>
      <div
        className="text-[rgb(var(--color-primary))] [&_a]:text-[rgb(var(--color-accent))] [&_a]:underline [&_p]:mb-4"
        dangerouslySetInnerHTML={{__html: page.body}}
      />
    </article>
  );
}
