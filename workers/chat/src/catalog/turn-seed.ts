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
  AUDITED_SOLITER_HANDLES,
  fetchStoneProducts,
  fetchStoreProductsByQuery,
  productMatchesStone,
  stoneHitNote,
  stoneMissNote,
  stoneUnconfirmedNote,
  type StoneCatalogEnv,
} from './stone-retrieval';
import {detectPolicyInformationIntent} from '../intent/policy-information';
import {detectSizeTableIntent} from '../intent/size-table';
import {
  buyerAllowsStoneSubstitute,
  detectStoneIntent,
  buyerAsksForRing,
  buyerAsksForWeddingBand,
  discoveryMetalBrowse,
  latestTurnClearsProductContext,
  metalPreferenceFromTurn,
  namedBrowseFromConversation,
  preferJewelryType,
  productLooksLikeFingerRing,
  productLooksLikeRing,
  productLooksLikeWeddingBand,
  productMatchesDiscoveryMetal,
  ringRetryQuery,
  type DiscoveryMetal,
} from './stone-intent';
import {storeFactContextLine} from './store-facts';
import type {StoneLookup} from './buyer-reply-guard';
import {
  applyTurnSearchHints,
  applyOriginFilterWithFallback,
  originAskForTurn,
  filterProductsByOriginAsk,
  isAssortmentYesNoAsk,
  isStoneOriginAssortmentQuestion,
  latestTurnSearchHints,
  originAssortmentSearchQueries,
  originCatalogQuery,
  originSafeLead,
  pickMixedOriginCards,
} from './stone-origin';

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

function productKey(product: Record<string, unknown>): string {
  if (typeof product.handle === 'string' && product.handle.trim()) return product.handle.trim();
  if (typeof product.title === 'string' && product.title.trim()) return product.title.trim();
  return '';
}

function cardMentionsClassic(product: Record<string, unknown>): boolean {
  const bits = [product.title, product.handle, product.description];
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : '';
  return /klasyczn/iu.test([...bits, tags].filter((value) => typeof value === 'string').join('\n'));
}

function selectDiscoveryMetalProducts(
  products: readonly Record<string, unknown>[],
  brand: string | undefined,
  metal: DiscoveryMetal,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const classic: Record<string, unknown>[] = [];
  const rest: Record<string, unknown>[] = [];
  for (const product of products) {
    const key = productKey(product);
    if (!key || seen.has(key)) continue;
    if (!brandKeepsProduct(product, brand)) continue;
    if (!productLooksLikeRing(product)) continue;
    if (!productMatchesDiscoveryMetal(product, metal)) continue;
    seen.add(key);
    if (cardMentionsClassic(product)) classic.push(product);
    else rest.push(product);
  }
  return [...classic, ...rest].slice(0, 4);
}

async function loadDiscoveryMetalCards(
  env: StoneCatalogEnv,
  brand: string | undefined,
  metal: DiscoveryMetal,
  classicQuery: string,
): Promise<{ok: boolean; products: Record<string, unknown>[]}> {
  const queries = [classicQuery, `pierścionek ${metal}`, `obrączka ${metal}`];
  const pool: Record<string, unknown>[] = [];
  let ok = false;
  for (const query of queries) {
    const found = await fetchStoreProductsByQuery(env, query, brand);
    if (!found.ok) {
      if (!ok) return {ok: false, products: []};
      continue;
    }
    ok = true;
    pool.push(...found.products);
    if (selectDiscoveryMetalProducts(pool, brand, metal).length >= 2) break;
  }
  return {ok, products: selectDiscoveryMetalProducts(pool, brand, metal)};
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
  const policyTurn = detectPolicyInformationIntent(latest).match;
  const sizeTurn = detectSizeTableIntent(latest).match;
  if (sizeTurn && !policyTurn) {
    lines.push(
      'Pytanie o rozmiar: odpowiedz wskazówką pomiaru (obwód palca albo średnica wewnętrzna) i tabelą rozmiarów. Nie wklejaj ceny, metalu, kamienia ani specyfikacji karty produktu.',
    );
    return {
      lines,
      snapshots,
      stoneLookup,
      pageCard,
      aboutPageProduct: false,
    };
  }

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

  if (policyTurn) {
    if (/certyfik|certificate/iu.test(latest)) {
      lines.push(
        'Pytanie o certyfikat: cytuj wyłącznie pole z karty tej tury albo wynik search_shop_policies_and_faqs. Jeśli karta nie podaje certyfikatu, napisz: karta tego nie podaje, proszę o kontakt z pracownią. Nie pokazuj losowego produktu.',
      );
    }
    return {
      lines,
      snapshots,
      stoneLookup,
      pageCard,
      aboutPageProduct: Boolean(pageCard) && buyerAsksAboutPageProduct(latest),
    };
  }

  const allowSubstitute = buyerAllowsStoneSubstitute(latest, input.previousAssistant);
  const stone = catalogStoneIntent({
    buyerTurns: input.buyerTurns,
    allowSubstitute,
    env: input.env,
    brand: input.brand,
  });

  const metalBrowse = discoveryMetalBrowse(input.buyerTurns);
  if (!metalBrowse && latestTurnClearsProductContext(latest, input.buyerTurns.slice(0, -1))) {
    return {
      lines,
      snapshots,
      stoneLookup,
      pageCard,
      aboutPageProduct: Boolean(pageCard) && buyerAsksAboutPageProduct(latest),
    };
  }

  try {
    const originAsk = originAskForTurn(input.buyerTurns);
    const originAssortment = isStoneOriginAssortmentQuestion(latest);
    const namedOnLatest = detectStoneIntent(latest);
    if (originAssortment && namedOnLatest && isAssortmentYesNoAsk(latest)) {
      const found = await fetchStoneProducts(input.env, namedOnLatest, input.brand, buyerText);
      if (found.confirmed) {
        let kept = preferJewelryType(
          found.products.filter((product) => brandKeepsProduct(product, input.brand)),
          latest,
        );
        kept = applyTurnSearchHints(kept, latestTurnSearchHints(latest), originAsk);
        const note = kept.length
          ? `${originSafeLead(input.brand)} Pokaż karty z kamieniem ${namedOnLatest.labelPl}. Przy pytaniu o naturalny zacznij od Tak/Nie.`
          : stoneMissNote(namedOnLatest.labelPl);
        const snapshot = presentedSnapshot(kept, note, input.brand);
        snapshots.push(snapshot);
        stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
        lines.push(stoneContextLine(snapshot, kept.length > 0));
      }
    } else if ((originAssortment && !stone) || (originAsk && !stone && !metalBrowse)) {
      const queries = originAssortment
        ? originAssortmentSearchQueries(input.brand)
        : [originCatalogQuery(originAsk, stone)];
      const pool: Record<string, unknown>[] = [];
      let ok = false;
      for (const query of queries) {
        const found = await fetchStoreProductsByQuery(input.env, query, input.brand);
        if (!found.ok) continue;
        ok = true;
        pool.push(...found.products.filter((product) => brandKeepsProduct(product, input.brand)));
      }
      if (!ok) {
        stoneLookup = 'unconfirmed';
        lines.push('Nie udało się potwierdzić pochodzenia kamieni w katalogu. Nie generalizuj asortymentu.');
      } else {
        let kept = originAssortment
          ? pickMixedOriginCards(pool, 3)
          : pickMixedOriginCards(filterProductsByOriginAsk(pool, originAsk), 3);
        kept = applyTurnSearchHints(kept, latestTurnSearchHints(latest), originAsk);
        const note = originAssortment
          ? `${originSafeLead(input.brand)} Pokaż 2–3 karty z tego wyniku. Nie mów, że wszystko jest naturalne albo wszystko syntetyczne.`
          : originAsk === 'natural'
            ? 'Tylko karty z kamieniem naturalnym. Syntetyki (w tym obraczka-z-szafirem-epir-jewellery) odpadają. Przy braku powiedz to wprost.'
            : 'Tylko karty z kamieniem syntetycznym albo laboratoryjnym.';
        const snapshot = presentedSnapshot(kept, note, input.brand);
        snapshots.push(snapshot);
        stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
        const text = (snapshot as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
        lines.push(`[TRAFENIA KATALOGU]\n${text}\n${originSafeLead(input.brand)}`);
      }
    } else if (stone) {
      const found = await fetchStoneProducts(input.env, stone, input.brand, buyerText);
      if (!found.confirmed) {
        stoneLookup = 'unconfirmed';
        lines.push(stoneUnconfirmedNote(stone.labelPl));
      } else {
        let kept = preferJewelryType(
          found.products.filter((product) => brandKeepsProduct(product, input.brand)),
          latest,
        );
        kept = kept.filter((product) => productMatchesStone(product, stone));
        kept = applyTurnSearchHints(kept, latestTurnSearchHints(latest), originAsk);
        const note = kept.length
          ? stoneHitNote(stone.labelPl)
          : originAsk === 'natural'
            ? `Brak naturalnego kamienia „${stone.labelPl}”. Powiedz to wprost. Nie pokazuj syntetyków.`
            : buyerAsksForRing(buyerText)
            ? `Brak pierścionków z kamieniem „${stone.labelPl}” w katalogu tej marki. Nie proponuj naszyjnika Iluzja.`
            : stoneMissNote(stone.labelPl);
        const snapshot = presentedSnapshot(kept, note, input.brand);
        snapshots.push(snapshot);
        stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
        lines.push(stoneContextLine(snapshot, kept.length > 0));
      }
    } else if (metalBrowse) {
      const found = await loadDiscoveryMetalCards(input.env, input.brand, metalBrowse.metal, metalBrowse.query);
      if (!found.ok) {
        stoneLookup = 'unconfirmed';
        lines.push(
          `Nie udało się potwierdzić klasycznego pierścionka w metalu „${metalBrowse.metal}”. Nie pisz, że go nie ma.`,
        );
      } else {
        const kept = found.products;
        const note = kept.length
          ? `Klient został przy klasycznym pierścionku i podał metal: ${metalBrowse.metal}. To są karty z katalogu tej marki. Pokaż 2–4 pozycje z ceną z karty, sizes_label i linkiem. Zostań przy tym rodzaju i tym metalu.`
          : `Brak klasycznych pierścionków w metalu „${metalBrowse.metal}” w katalogu tej marki. Powiedz to wprost, bez innego SKU.`;
        const snapshot = presentedSnapshot(kept, note, input.brand);
        snapshots.push(snapshot);
        stoneLookup = kept.length ? 'hit' : 'confirmed_miss';
        const text = (snapshot as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
        lines.push(`[TRAFENIA KATALOGU]\n${text}`);
        if (!readPresentedProducts(snapshot).length && kept.length) {
          stoneLookup = 'unconfirmed';
        }
      }
    } else {
      let browseQuery = namedBrowseFromConversation(input.buyerTurns);
      if (browseQuery) {
        if (/z[łl]ot/iu.test(latest) && !/z[łl]ot|\bgold\b/iu.test(browseQuery)) browseQuery = `${browseQuery} złoto`;
        if (/srebr/iu.test(latest) && !/srebr|silver/iu.test(browseQuery)) browseQuery = `${browseQuery} srebro`;
        if (/ślubn|slubn|wedding/iu.test(latest) && !/ślubn|slubn|wedding/iu.test(browseQuery)) {
          browseQuery = `${browseQuery} ślubne`;
        }
        const found = await fetchStoreProductsByQuery(input.env, browseQuery, input.brand);
        if (!found.ok) {
          stoneLookup = 'unconfirmed';
          lines.push('Nie udało się potwierdzić tej pozycji w sklepie. Nie pisz, że jej nie ma.');
        } else {
          let matched = found.products.filter((product) => brandKeepsProduct(product, input.brand));
          const metalWanted = metalPreferenceFromTurn(latest) ?? (/z[łl]ot/iu.test(latest) ? 'złoto' : /srebr/iu.test(latest) ? 'srebro' : null);
          if (metalWanted) {
            const metalHits = matched.filter((product) => productMatchesDiscoveryMetal(product, metalWanted));
            if (metalHits.length) matched = metalHits;
            else if (/obr[aą]cz|pier[sś]cion|bransolet/iu.test(latest)) matched = [];
          }
          if (buyerAsksForWeddingBand(latest) || buyerAsksForWeddingBand(browseQuery)) {
            const bands = matched.filter((product) => productLooksLikeWeddingBand(product));
            if (bands.length) matched = bands;
          } else if (/pierścionek soliter|soliter|solitaire/iu.test(browseQuery) && !/kolczyk/iu.test(latest)) {
            let rings = matched.filter((product) => productLooksLikeFingerRing(product));
            if (!rings.length) {
              const again = await fetchStoreProductsByQuery(
                input.env,
                'pierścionek soliter -kolczyki -kolczyk',
                input.brand,
              );
              if (again.ok) {
                rings = again.products.filter(
                  (product) => brandKeepsProduct(product, input.brand) && productLooksLikeFingerRing(product),
                );
              }
            }
            const auditedRings: Record<string, unknown>[] = [];
            for (const handle of AUDITED_SOLITER_HANDLES) {
              const audited = await fetchStoreProductsByQuery(input.env, `handle:${handle}`, input.brand);
              if (!audited.ok) continue;
              for (const product of audited.products) {
                if (product.handle !== handle) continue;
                if (!brandKeepsProduct(product, input.brand)) continue;
                if (!productLooksLikeFingerRing(product)) continue;
                auditedRings.push(product);
              }
            }
            if (auditedRings.length) {
              const seen = new Set(
                rings.map((product) => (typeof product.handle === 'string' ? product.handle : '')).filter(Boolean),
              );
              rings = [
                ...auditedRings.filter((product) => {
                  const handle = typeof product.handle === 'string' ? product.handle : '';
                  if (!handle || seen.has(handle)) return false;
                  seen.add(handle);
                  return true;
                }),
                ...rings,
              ];
            }
            matched = rings;
          } else if (buyerAsksForRing(latest) || buyerAsksForRing(browseQuery)) {
            let rings = matched.filter((product) => productLooksLikeRing(product));
            if (!rings.length) {
              const again = await fetchStoreProductsByQuery(input.env, ringRetryQuery(browseQuery), input.brand);
              if (again.ok) {
                rings = again.products.filter(
                  (product) => brandKeepsProduct(product, input.brand) && productLooksLikeRing(product),
                );
              }
            }
            matched = rings;
          } else if (/bransolet/iu.test(browseQuery)) {
            matched = matched.filter((product) => {
              const title = typeof product.title === 'string' ? product.title : '';
              const handle = typeof product.handle === 'string' ? product.handle : '';
              return /bransolet|bracelet/iu.test(`${title} ${handle}`);
            });
          }
          matched = applyTurnSearchHints(matched, latestTurnSearchHints(latest), originAskForTurn(input.buyerTurns));
          const kept = preferJewelryType(matched, latest).length
            ? preferJewelryType(matched, latest)
            : matched.slice(0, 4);
          const bandMiss = buyerAsksForWeddingBand(latest) && !kept.length;
          const note = kept.length
            ? kept.some((product) => product.budget_miss === true)
              ? `Żadna pozycja nie mieści się w budżecie do ${kept[0]?.budget_cap_pln} zł. Pokaż najtańszą opcję z karty i powiedz to wprost.`
              : 'To są karty z katalogu tej marki. Pokaż 2–4 pozycje z ceną z karty, sizes_label i linkiem z url. Nie pisz, że pozycji nie ma.'
            : bandMiss
              ? 'Brak obrączek w katalogu tej marki. Powiedz to wprost. Możesz zaproponować pierścionki albo zamówienie indywidualne — nie podmieniaj po cichu na pierścionki zaręczynowe.'
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
