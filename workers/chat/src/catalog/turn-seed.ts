/**
 * Przed modelem: karta strony i pierwsze trafienia katalogu.
 * Pusta odpowiedź „nie ma w ofercie” nie może wyjść, zanim ten odczyt się skończy.
 */

import {presentCatalogForModel} from '../mcp/catalog-for-model';
import {
  buyerAsksAboutPageProduct,
  formatPageCardContext,
  brandKeepsProduct,
  loadPageProductCard,
  readPresentedProducts,
} from './page-product-card';
import {
  catalogStoneIntent,
  fetchStoneProducts,
  fetchStoreProductsByQuery,
  stoneHitNote,
  stoneMissNote,
  stoneUnconfirmedNote,
  type StoneCatalogEnv,
} from './stone-retrieval';
import {buyerAllowsStoneSubstitute, namedBrowseFromConversation, preferJewelryType} from './stone-intent';
import {storeFactContextLine} from './store-facts';
import type {StoneLookup} from './buyer-reply-guard';

export type SeededBuyerTurn = {
  lines: string[];
  snapshots: unknown[];
  stoneLookup: StoneLookup;
  pageCard: Record<string, unknown> | null;
  aboutPageProduct: boolean;
};

const EMPTY_SEED: SeededBuyerTurn = {
  lines: [],
  snapshots: [],
  stoneLookup: 'none',
  pageCard: null,
  aboutPageProduct: false,
};

function presentedSnapshot(products: Record<string, unknown>[], note: string, brand?: string): unknown {
  return presentCatalogForModel({products, system_note: note}, {brand});
}

function stoneContextLine(snapshot: unknown, hit: boolean): string {
  const text = (snapshot as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
  const lead = hit
    ? 'Pierwsza odpowiedź: pokaż 2–4 pozycje z products. Nie pisz, że kamienia nie ma.'
    : 'Potwierdzony brak tego kamienia. Powiedz to wprost, bez innego SKU.';
  return `[TRAFENIA KAMIENIA]\n${text}\n${lead}`;
}

export async function seedBuyerTurnContext(input: {
  env: StoneCatalogEnv;
  brand?: string;
  productHandle?: string;
  buyerTurns: readonly string[];
  previousAssistant?: string;
  operatorMode?: boolean;
}): Promise<SeededBuyerTurn> {
  if (input.operatorMode) return EMPTY_SEED;
  const lines: string[] = [storeFactContextLine(input.brand)];
  const snapshots: unknown[] = [];
  let stoneLookup: StoneLookup = 'none';
  let pageCard: Record<string, unknown> | null = null;
  const latest = input.buyerTurns[input.buyerTurns.length - 1] ?? '';
  const buyerText = input.buyerTurns.join('\n');

  const handle = input.productHandle?.trim();
  if (handle) {
    try {
      const loaded = await loadPageProductCard(input.env, handle, input.brand);
      if (loaded) {
        pageCard = loaded.card;
        snapshots.push(loaded.snapshot);
        lines.push(formatPageCardContext(loaded.card));
      }
    } catch (error) {
      console.warn('[page-card] seed failed', error instanceof Error ? error.message : error);
    }
  }

  const allowSubstitute = buyerAllowsStoneSubstitute(latest, input.previousAssistant);
  const stone = catalogStoneIntent({
    buyerTurns: input.buyerTurns,
    allowSubstitute,
    env: input.env,
    brand: input.brand,
  });

  try {
    if (stone) {
      const found = await fetchStoneProducts(input.env, stone, input.brand);
      if (!found.confirmed) {
        stoneLookup = 'unconfirmed';
        lines.push(stoneUnconfirmedNote(stone.labelPl));
      } else {
        const kept = preferJewelryType(
          found.products.filter((product) => brandKeepsProduct(product, input.brand)),
          buyerText,
        );
        const note = kept.length ? stoneHitNote(stone.labelPl) : stoneMissNote(stone.labelPl);
        const snapshot = presentedSnapshot(kept, note, input.brand);
        snapshots.push(snapshot);
        stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
        lines.push(stoneContextLine(snapshot, kept.length > 0));
      }
    } else {
      const browseQuery = namedBrowseFromConversation(input.buyerTurns);
      if (browseQuery) {
        const found = await fetchStoreProductsByQuery(input.env, browseQuery);
        if (!found.ok) {
          stoneLookup = 'unconfirmed';
          lines.push('Nie udało się potwierdzić tej pozycji w sklepie. Nie pisz, że jej nie ma.');
        } else {
          const kept = found.products.filter((product) => brandKeepsProduct(product, input.brand)).slice(0, 4);
          const note = kept.length
            ? 'To są karty z katalogu tej marki. Pokaż 2–4 pozycje z ceną z karty i sizes_label. Nie pisz, że pozycji nie ma.'
            : `Brak pozycji dla „${browseQuery}” w katalogu tej marki. Powiedz to wprost, bez innego SKU.`;
          const snapshot = presentedSnapshot(kept, note, input.brand);
          snapshots.push(snapshot);
          stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
          const text = (snapshot as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
          lines.push(`[TRAFENIA KATALOGU]\n${text}`);
          if (!readPresentedProducts(snapshot).length && kept.length) {
            stoneLookup = 'unconfirmed';
          }
        }
      }
    }
  } catch (error) {
    console.warn('[catalog-seed] lookup failed', error instanceof Error ? error.message : error);
    stoneLookup = 'unconfirmed';
  }

  return {
    lines,
    snapshots,
    stoneLookup,
    pageCard,
    aboutPageProduct: Boolean(pageCard) && buyerAsksAboutPageProduct(latest),
  };
}
