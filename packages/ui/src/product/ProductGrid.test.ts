import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import ProductGrid from './ProductGrid';

vi.mock('@shopify/hydrogen', () => ({
  Pagination: ({
    children,
  }: {
    children: (info: {
      nodes: Array<{id: string; title: string; handle: string}>;
      NextLink: (props: {
        children: React.ReactNode;
        className?: string;
        preventScrollReset?: boolean;
      }) => ReturnType<typeof createElement>;
      isLoading: boolean;
      hasNextPage: boolean;
    }) => React.ReactNode;
  }) =>
    children({
      nodes: [
        {id: 'gid://shopify/Product/1', title: 'Pierścionek', handle: 'pierscionek'},
      ],
      NextLink: ({children, className}) =>
        createElement('a', {href: '/next', className}, children),
      isLoading: false,
      hasNextPage: true,
    }),
}));

vi.mock('./ProductCard', () => ({
  default: ({product}: {product: {title: string}}) =>
    createElement('div', {'data-testid': 'product-card'}, product.title),
}));

describe('ProductGrid', () => {
  it('renders products and load-more link from Pagination connection', () => {
    const html = renderToStaticMarkup(
      createElement(ProductGrid, {
        connection: {
          nodes: [
            {
              id: 'gid://shopify/Product/1',
              title: 'Pierścionek',
              handle: 'pierscionek',
            },
          ],
          pageInfo: {
            hasPreviousPage: false,
            hasNextPage: true,
            startCursor: 'start',
            endCursor: 'end',
          },
        },
      }),
    );

    expect(html).toContain('Pierścionek');
    expect(html).toContain('Załaduj więcej');
    expect(html).toContain('href="/next"');
  });
});
