import { describe, it, expect } from 'vitest';
import { detectIntent, type UserIntent } from '../src/domain/orchestrator';

describe('detectIntent', () => {
  it('returns "cart" for Polish cart keywords', () => {
    const cartQueries = [
      'co mam w koszyku',
      'pokaż koszyk',
      'dodaj do koszyka',
      'zawartość koszyka',
      'usuń z koszyka',
      'aktualizuj koszyk',
    ];
    for (const q of cartQueries) {
      expect(detectIntent(q), `Expected cart for: "${q}"`).toBe('cart');
    }
  });

  it('returns "cart" for English cart keywords', () => {
    const cartQueries = ['show cart', 'add to cart', 'my cart', 'update cart'];
    for (const q of cartQueries) {
      expect(detectIntent(q), `Expected cart for: "${q}"`).toBe('cart');
    }
  });

  it('returns "order" for Polish order keywords', () => {
    const orderQueries = [
      'status zamówienia',
      'moje zamówienie',
      'gdzie jest paczka',
      'kiedy dotrze przesyłka',
      'ostatnie zamówienie',
      'śledzenie przesyłki',
    ];
    for (const q of orderQueries) {
      expect(detectIntent(q), `Expected order for: "${q}"`).toBe('order');
    }
  });

  it('returns "order" for English order keywords', () => {
    const orderQueries = ['order status', 'track my order', 'recent order', 'where is my package'];
    for (const q of orderQueries) {
      expect(detectIntent(q), `Expected order for: "${q}"`).toBe('order');
    }
  });

  it('returns "faq" for Polish FAQ/policy keywords', () => {
    const faqQueries = [
      'polityka zwrotów',
      'jak zrobić zwrot',
      'wysyłka do Polski',
      'dostawa do domu',
      'reklamacja produktu',
      'gwarancja na biżuterię',
    ];
    for (const q of faqQueries) {
      expect(detectIntent(q), `Expected faq for: "${q}"`).toBe('faq');
    }
  });

  it('returns "faq" for English FAQ keywords', () => {
    const faqQueries = ['return policy', 'shipping time', 'delivery options', 'warranty info'];
    for (const q of faqQueries) {
      expect(detectIntent(q), `Expected faq for: "${q}"`).toBe('faq');
    }
  });

  it('returns "search" for product search queries (default)', () => {
    const searchQueries = [
      'Jakie masz pierścionki?',
      'szukam kolczyków złotych',
      'pokaż mi bransoletki',
      'co polecasz jako prezent',
    ];
    for (const q of searchQueries) {
      expect(detectIntent(q), `Expected search for: "${q}"`).toBe('search');
    }
  });

  it('cart intent takes priority over other intents', () => {
    // A query mentioning both cart and order should resolve to cart
    expect(detectIntent('dodaj zamówienie do koszyka')).toBe('cart');
  });

  it('is case-insensitive', () => {
    expect(detectIntent('KOSZYK')).toBe('cart');
    expect(detectIntent('STATUS ZAMÓWIENIA')).toBe('order');
    expect(detectIntent('POLITYKA ZWROTÓW')).toBe('faq');
  });
});
