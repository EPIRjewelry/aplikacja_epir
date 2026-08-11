/**
 * Eksport statycznego HTML landingów (nowa paleta) — bez deployu, bez Shopify API.
 *   npx tsx scripts/export-landing-preview.ts
 *   npx tsx scripts/export-landing-preview.ts organic_art forest_premium
 */
import {mkdirSync, writeFileSync} from 'fs';
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';
import type {CampaignLandingData} from '../src/campaign';
import type {Env} from '../src/env';
import {renderApexEditorialHtml} from '../src/render-apex-editorial';
import {renderOrganicArtLandingHtml} from '../src/render-organic-art';
import type {ProductNode} from '../src/render-shared';

const dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(dir, '../.preview-html');

const MOCK_ENV = {
  SHOPIFY_PUBLIC_DOMAIN: 'epirbizuteria.pl',
  SHOPIFY_STOREFRONT_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
  LANDINGS_ENABLED: 'true',
} as Env;

const MOCK_PRODUCTS: ProductNode[] = [
  {
    id: 'gid://shopify/Product/1',
    title: 'Pierścionek Gałązki z czarnym turmalinem',
    handle: 'pierscionek-galazki-z-czarnym-turmalinem',
    featuredImage: {
      url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png',
      altText: 'Pierścionek',
    },
    priceRange: {minVariantPrice: {amount: '890.0', currencyCode: 'PLN'}},
  },
  {
    id: 'gid://shopify/Product/2',
    title: 'Kolczyki Gałązki z topazami',
    handle: 'kolczyki-galazki-z-topazami-london-blue',
    featuredImage: {
      url: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-1_large.png',
      altText: 'Kolczyki',
    },
    priceRange: {minVariantPrice: {amount: '720.0', currencyCode: 'PLN'}},
  },
];

const CAMPAIGNS: Record<string, CampaignLandingData> = {
  organic_art: {
    handle: 'organic-art-landing',
    heroTitle: 'Biżuteria artystyczna',
    heroSubtitle: 'Ręcznie tworzona biżuteria z polskiej pracowni.',
    productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    ctaLabel: 'Odkryj kolekcję',
    ctaUrl: '/collections/kolekcja-galazki',
  },
  forest_premium: {
    handle: 'forest-premium-landing',
    heroTitle: 'Rzemiosło premium',
    heroSubtitle: 'Ciemny las, organiczna forma.',
    productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    ctaLabel: 'Zobacz kolekcję',
    ctaUrl: '/collections/bestsellery',
  },
  artisan_rings: {
    handle: 'artisan-rings-landing',
    heroTitle: 'Pierścionki artystyczne',
    heroSubtitle: 'Forma, która nie boi się tekstury.',
    productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    ctaLabel: 'Zobacz pierścionki',
    ctaUrl: '/collections/bestsellery',
  },
  artisan_new: {
    handle: 'artisan-new-landing',
    heroTitle: 'Nowości w pracowni',
    heroSubtitle: 'Świeżo z warsztatu.',
    productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    ctaLabel: 'Zobacz nowości',
    ctaUrl: '/collections/bestsellery',
  },
  artisan_gold: {
    handle: 'artisan-gold-landing',
    heroTitle: 'Biżuteria ze złota',
    heroSubtitle: 'Złoto z pracowni.',
    productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
    ctaLabel: 'Odkryj złoto',
    ctaUrl: '/collections/bestsellery',
  },
};

function renderCampaign(key: string): string {
  const campaign = CAMPAIGNS[key];
  if (!campaign) throw new Error(`Nieznana kampania: ${key}`);
  if (key === 'organic_art') {
    return renderOrganicArtLandingHtml(MOCK_ENV, campaign, MOCK_PRODUCTS);
  }
  return renderApexEditorialHtml(MOCK_ENV, campaign, MOCK_PRODUCTS);
}

const keys = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(CAMPAIGNS);

mkdirSync(outDir, {recursive: true});
const written: string[] = [];

for (const key of keys) {
  const html = renderCampaign(key);
  const path = join(outDir, `${key}.html`);
  writeFileSync(path, html, 'utf8');
  written.push(path);
  console.log(path);
}

console.log('');
console.log('Otwórz plik .html w przeglądarce (file://). Tailwind ładuje się z CDN — potrzebny internet.');
console.log('To podgląd lokalny nowej palety; l.epirbizuteria.pl na produkcji = stara wersja do deployu.');
