import type {ChatBrandLock} from '../../../src/brand-lock';

export function geBuyerBrandLock(): ChatBrandLock {
  return {
    brandKey: 'epir',
    brand: 'epir',
    storefrontId: 'online-store',
    channel: 'online-store',
    source: 'test',
    side: 'epir',
  };
}

export function gzBuyerBrandLock(): ChatBrandLock {
  return {
    brandKey: 'zareczyny',
    brand: 'zareczyny',
    storefrontId: 'zareczyny',
    channel: 'hydrogen-zareczyny',
    source: 'test',
    side: 'zareczyny',
  };
}

export function kazkaBuyerBrandLock(): ChatBrandLock {
  return {
    brandKey: 'kazka',
    brand: 'kazka',
    storefrontId: 'kazka',
    channel: 'hydrogen-kazka',
    source: 'test',
    side: 'kazka',
  };
}
