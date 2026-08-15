import {describe, expect, it} from 'vitest';
import {orderProductMedia} from './orderProductMedia';

describe('orderProductMedia', () => {
  it('puts video second even when Shopify lists it third', () => {
    const ordered = orderProductMedia([
      {mediaContentType: 'IMAGE', id: 'i1'},
      {mediaContentType: 'IMAGE', id: 'i2'},
      {mediaContentType: 'VIDEO', id: 'v1'},
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['i1', 'v1', 'i2']);
  });

  it('detects video by sources when mediaContentType is missing', () => {
    const ordered = orderProductMedia([
      {id: 'i1', image: {url: 'a.jpg'}},
      {id: 'i2', image: {url: 'b.jpg'}},
      {
        id: 'v1',
        __typename: 'Video',
        sources: [{mimeType: 'video/mp4', url: 'https://cdn.example/a.mp4'}],
      },
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['i1', 'v1', 'i2']);
  });
});
