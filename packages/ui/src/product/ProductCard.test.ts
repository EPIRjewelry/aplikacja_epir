import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import ProductCard from './ProductCard';

vi.mock('@remix-run/react', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => createElement('a', {href: to, ...props}, children),
}));

describe('ProductCard', () => {
  it('prefers LAB variant price and href when preferVariantOptions is set', () => {
    const html = renderToStaticMarkup(
      createElement(ProductCard, {
        product: {
          id: 'gid://shopify/Product/1',
          title: 'Soliter',
          handle: 'soliter',
          variants: {
            nodes: [
              {
                selectedOptions: [{name: 'Jakość', value: 'D/VVS2'}],
                price: {amount: '12000', currencyCode: 'PLN'},
                image: {url: 'https://cdn.example/natural.jpg', altText: 'Natural'},
              },
              {
                selectedOptions: [{name: 'Jakość', value: 'LAB'}],
                price: {amount: '6900', currencyCode: 'PLN'},
                image: {url: 'https://cdn.example/lab.jpg', altText: 'LAB'},
              },
            ],
          },
          media: {nodes: []},
        },
        preferVariantOptions: [{name: 'Jakość', value: 'LAB'}],
      }),
    );

    expect(html).toContain('href="/products/soliter?Jako%C5%9B%C4%87=LAB"');
    expect(html).toContain('6900');
    expect(html).toContain('zł');
    expect(html).toContain('lab.jpg');
    expect(html).not.toContain('natural.jpg');
  });
});
