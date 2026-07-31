import {describe, expect, it} from 'vitest';
import {parseChatPathContext} from './chat-path-context';

describe('parseChatPathContext', () => {
  it('parses collection handle', () => {
    expect(parseChatPathContext('/collections/kazka-pierscionki')).toEqual({
      collectionHandle: 'kazka-pierscionki',
    });
  });

  it('parses product handle', () => {
    expect(parseChatPathContext('/products/102-10115-3-0-pr')).toEqual({
      productHandle: '102-10115-3-0-pr',
    });
  });

  it('ignores trailing slash and query', () => {
    expect(parseChatPathContext('/collections/kazka/')).toEqual({
      collectionHandle: 'kazka',
    });
  });

  it('returns empty for home', () => {
    expect(parseChatPathContext('/')).toEqual({});
  });
});
