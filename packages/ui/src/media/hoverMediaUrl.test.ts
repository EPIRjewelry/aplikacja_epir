import {describe, expect, it} from 'vitest';
import {hoverMedia} from './hoverMediaUrl';

describe('hoverMedia', () => {
  it('uses the video even when it is the third Shopify media item', () => {
    const hover = hoverMedia([
      {mediaContentType: 'IMAGE', image: {url: 'https://cdn.example/1.jpg'}},
      {mediaContentType: 'IMAGE', image: {url: 'https://cdn.example/2.jpg'}},
      {
        mediaContentType: 'VIDEO',
        sources: [{mimeType: 'video/mp4', url: 'https://cdn.example/clip.mp4'}],
      },
    ]);
    expect(hover).toEqual({kind: 'video', url: 'https://cdn.example/clip.mp4'});
  });
});
