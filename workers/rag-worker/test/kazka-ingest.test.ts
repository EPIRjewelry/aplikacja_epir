import {describe, expect, it} from 'vitest';
import {parseCollectionFilter, unionCollectionsByHandle} from '../src/ingest/collection-filter';
import {buildCollectionDoc, buildProductDoc} from '../src/ingest/kazka-storefront-ingest';

describe('parseCollectionFilter', () => {
  it('parses CSV handles', () => {
    expect(parseCollectionFilter('kazka, kazka-kolczyki')).toEqual([
      'kazka',
      'kazka-kolczyki',
    ]);
  });
});

describe('unionCollectionsByHandle', () => {
  it('dedupes by handle', () => {
    const out = unionCollectionsByHandle(
      [{handle: 'a', title: 'A'}],
      [{handle: 'a', title: 'A2'}, {handle: 'b', title: 'B'}],
    );
    expect(out.map((c) => c.handle)).toEqual(['a', 'b']);
    expect(out[0].title).toBe('A');
  });
});

describe('kazka ingest document builders', () => {
  it('builds collection doc metadata', () => {
    const doc = buildCollectionDoc({
      id: 'gid://shopify/Collection/1',
      handle: 'kazka-pierscionki',
      title: 'Pierścionki',
      description: 'Drop pierścionków',
    });
    expect(doc.id).toBe('kazka:collection:kazka-pierscionki');
    expect(doc.metadata.brand).toBe('kazka');
    expect(doc.metadata.type).toBe('collection');
    expect(doc.text).toContain('Pierścionki');
  });

  it('builds product doc with collection handle', () => {
    const doc = buildProductDoc(
      {
        id: 'gid://shopify/Product/1',
        handle: 'soliter',
        title: 'Pierścionek Soliter',
        description: 'Opis',
        tags: ['kazka'],
      },
      'kazka-pierscionki',
    );
    expect(doc.id).toBe('kazka:product:soliter');
    expect(doc.metadata.collectionHandle).toBe('kazka-pierscionki');
    expect(doc.text).toContain('Kolekcja: kazka-pierscionki');
  });
});
