/**
 * Operator Studio — presety trybu pracy (workflow → agent + model + prompt).
 * Używane przez solo-dev-chat HTML; bez nowych endpointów API.
 */
import type { ModelVariantKey } from '../config/model-params';
import type { SoloDevAgentId } from '../solo-dev-agent-presets';

export type OperatorWorkflowGroup = 'data' | 'creative' | 'production' | 'storefront';

export type OperatorWorkflowId =
  | 'data_flow_audit'
  | 'data_warehouse'
  | 'data_marketing'
  | 'data_shopify'
  | 'creative_trace'
  | 'creative_logo'
  | 'creative_icon_line'
  | 'creative_svg_code'
  | 'creative_copy'
  | 'creative_gdocs_brief'
  | 'production_blender'
  | 'storefront_hero'
  | 'storefront_landing_copy'
  | 'storefront_banner';

const KAZKA_BRAND_SUFFIX =
  ' Marka Kazka: granat #0A1628, beż #F5F0E6, złoto #C9A96E. Typografia: Cormorant Garamond. Luksusowa biżuteria — bez clipartu, bez tekstu w obrazie (chyba że prosisz o mockup z copy).';

const ZARECZYNY_BRAND_SUFFIX =
  ' Marka Zaręczyny: elegancki minimalizm, ciepłe tło, subtelne złoto. Bez clipartu; tekst w obrazie tylko na wyraźną prośbę.';

export type OperatorWorkflowPreset = {
  readonly id: OperatorWorkflowId;
  readonly group: OperatorWorkflowGroup;
  readonly label: string;
  readonly description: string;
  readonly agentId: SoloDevAgentId;
  readonly modelVariant: '' | ModelVariantKey;
  /** Doklejane do wiadomości operatora (po podwójnej newline). */
  readonly promptSuffix: string;
  /** Baner nad wątkiem — czego oczekiwać w odpowiedzi. */
  readonly outcomeBanner: string;
  /** Panel „Źródła” po prawej. */
  readonly sourcesHint: string;
};

const TRACE_SUFFIX =
  'Styl: flat 2D logo mark only, black silhouette on pure white background, no gradients, no text, no shadow, no human figure, centered, high contrast, clean edges for vector tracing, square canvas.';

export const OPERATOR_WORKFLOW_PRESETS: readonly OperatorWorkflowPreset[] = [
  {
    id: 'data_flow_audit',
    group: 'data',
    label: 'Dane — audyt przepływu (EDOG)',
    description: 'Sprawdź flow-health przed interpretacją liczb z hurtowni.',
    agentId: 'internal_analytics',
    modelVariant: '',
    promptSuffix:
      'Tryb EDOG: najpierw ustal stan przepływu (D1, batch_exports, flow-health / MCP epir-data-ops). Przy FAIL lub DEGRADED opisz reasons[] i kroki ops; przy interpretacji hurtowni ostrzeż, jeśli warstwa danych jest słaba — platforma nie blokuje run_analytics_query (chyba że operator włączył EDOG_GATE_ENABLED).',
    outcomeBanner: 'Wynik: raport EDOG (PASS/FAIL + warstwy d1/batch/r2sql) bez zmyślonych metryk.',
    sourcesHint: 'Źródło: flow-health / batch_exports; hurtownia dopiero po PASS.',
  },
  {
    id: 'data_warehouse',
    group: 'data',
    label: 'Dane — hurtownia (Q1–Q10)',
    description: 'Pixel → R2 SQL; narzędzie run_analytics_query.',
    agentId: 'internal_analytics',
    modelVariant: '',
    promptSuffix: '',
    outcomeBanner: 'Wynik: raport analityczny z hurtowni EPIR (tekst + liczby ze źródeł).',
    sourcesHint: 'Źródło: run_analytics_query → epir_pixel_events / messages (R2 SQL).',
  },
  {
    id: 'data_marketing',
    group: 'data',
    label: 'Dane — GA4 + Google Ads',
    description: 'Podgląd z epir-marketing-ingest.',
    agentId: 'internal_analytics',
    modelVariant: '',
    promptSuffix: '',
    outcomeBanner: 'Wynik: agregat marketing_preview (GA4 + Ads).',
    sourcesHint: 'Źródło: fetch_marketing_preview (Bearer na marketing-ingest).',
  },
  {
    id: 'data_shopify',
    group: 'data',
    label: 'Dane — Shopify Admin (ShopifyQL)',
    description: 'Presety S1–S3; SHOPIFY_ADMIN_TOKEN.',
    agentId: 'internal_analytics',
    modelVariant: '',
    promptSuffix: '',
    outcomeBanner: 'Wynik: raport ShopifyQL (presety S1–S3).',
    sourcesHint: 'Źródło: run_shopify_shopifyql (Admin GraphQL, nie Storefront MCP).',
  },
  {
    id: 'creative_trace',
    group: 'creative',
    label: 'Kreacja — ryngraf / trace',
    description: 'Recraft utility_vector; obraz do wektoryzacji.',
    agentId: 'creative_image',
    modelVariant: 'or_recraft_v41_utility_vector',
    promptSuffix: TRACE_SUFFIX,
    outcomeBanner: 'Wynik: obraz w czacie — pobierz i wektoryzuj (Inkscape/Illustrator).',
    sourcesHint: 'OpenRouter Recraft (modalities image). Nie plik .svg z API.',
  },
  {
    id: 'creative_logo',
    group: 'creative',
    label: 'Kreacja — logo vector',
    description: 'Recraft pro_vector; więcej detalu znaku.',
    agentId: 'creative_image',
    modelVariant: 'or_recraft_v41_pro_vector',
    promptSuffix: TRACE_SUFFIX + ' Category: vector logo mark, minimal detail, brand-ready.',
    outcomeBanner: 'Wynik: obraz logo — trace lub import do DTP.',
    sourcesHint: 'Recraft pro_vector. Storefront MCP (Gemma) nie jest używany.',
  },
  {
    id: 'creative_icon_line',
    group: 'creative',
    label: 'Kreacja — icon line',
    description: 'Line icon, cienki stroke.',
    agentId: 'creative_image',
    modelVariant: 'or_recraft_v41_utility_vector',
    promptSuffix:
      TRACE_SUFFIX + ' Style: line icon, uniform 2px stroke, rounded caps, no fill except black lines on white.',
    outcomeBanner: 'Wynik: line icon jako obraz — dopracuj w edytorze wektorowym.',
    sourcesHint: 'Recraft utility_vector + prompt line icon.',
  },
  {
    id: 'creative_svg_code',
    group: 'creative',
    label: 'Kreacja — kod SVG',
    description: 'Claude/GPT — markup w czacie.',
    agentId: 'creative_svg',
    modelVariant: 'or_claude_sonnet_4',
    promptSuffix: 'Zwróć wyłącznie fragment <svg>...</svg> z viewBox i nazwanymi grupami, bez komentarzy.',
    outcomeBanner: 'Wynik: kod SVG w bąbelku (kopiuj do Inkscape/Blender).',
    sourcesHint: 'Model tekstowy — nie Recraft.',
  },
  {
    id: 'creative_copy',
    group: 'creative',
    label: 'Kreacja — copy / brief',
    description: 'Nagłówki, CTA, warianty A/B.',
    agentId: 'creative_copy',
    modelVariant: 'or_gpt4o_mini',
    promptSuffix: '',
    outcomeBanner: 'Wynik: tekst reklamowy (warianty A/B).',
    sourcesHint: 'Modele tekstowe OpenRouter / Groq.',
  },
  {
    id: 'creative_gdocs_brief',
    group: 'creative',
    label: 'Kreacja — brief Google Docs',
    description: 'ID pliku → MCP Markdown/CSV (Cursor).',
    agentId: 'creative_gdocs_brief',
    modelVariant: 'or_claude_sonnet_4',
    promptSuffix:
      'Jeśli w wątku jest treść briefu (Markdown/CSV) — opracuj ją. Jeśli jest tylko Google file ID — poproś o treść z Cursor MCP (epir-gworkspace), nie udawaj odczytu Dysku.',
    outcomeBanner: 'Wynik: interpretacja briefu — wymaga treści w wątku lub sesji Cursor + MCP.',
    sourcesHint: 'Odczyt pliku: Cursor MCP epir-gworkspace. Ten panel wysyła tylko ID / wklejony tekst do workera.',
  },
  {
    id: 'production_blender',
    group: 'production',
    label: 'Produkcja — Blender workflow',
    description: 'curve→mesh / packshot przez blender_bridge_invoke (most HTTP na PC).',
    agentId: 'creative_blender_flow',
    modelVariant: 'or_gpt4o',
    promptSuffix: '',
    outcomeBanner: 'Wynik: kroki Blender + ewentualny krótki bpy (bez destrukcji).',
    sourcesHint: 'Mesh/render: narzędzie blender_bridge_invoke (relay 9876 + addon 8765). Fallback: Cursor MCP.',
  },
  {
    id: 'storefront_hero',
    group: 'storefront',
    label: 'Sklep — hero / landing (obraz)',
    description: 'Szeroki kadr pod section_hero; Recraft lub model image z katalogu OR.',
    agentId: 'creative_storefront',
    modelVariant: 'or_recraft_v41_pro',
    promptSuffix:
      'Format: szeroki hero 16:9, luksusowa biżuteria, dużo negatywu, bez tekstu w kadrze.' +
      KAZKA_BRAND_SUFFIX,
    outcomeBanner: 'Wynik: obraz hero — pobierz i wgraj do Shopify/metaobject lub Hydrogen.',
    sourcesHint: 'Preset Recraft lub Katalog OpenRouter (filtr: generacja obrazu).',
  },
  {
    id: 'storefront_landing_copy',
    group: 'storefront',
    label: 'Sklep — copy landing',
    description: 'Nagłówek, lead, CTA, sekcje — dowolny model tekstowy z katalogu OR.',
    agentId: 'creative_storefront',
    modelVariant: 'or_claude_sonnet_4',
    promptSuffix:
      'Zwróć: H1, podtytuł, 2× CTA (tekst+rola), krótki opis sekcji hero i 3 bulletów wartości.' +
      KAZKA_BRAND_SUFFIX,
    outcomeBanner: 'Wynik: copy do landing / section_hero (tekst).',
    sourcesHint: 'Katalog OpenRouter — modele tekstowe; bez Recraft.',
  },
  {
    id: 'storefront_banner',
    group: 'storefront',
    label: 'Sklep — baner promo',
    description: 'Baner poziomy pod kampanię lub kolekcję.',
    agentId: 'creative_storefront',
    modelVariant: 'or_recraft_v41_utility_vector',
    promptSuffix:
      'Format: baner poziomy 3:1, prosty znak lub produkt, dużo tła, bez drobnego tekstu.' +
      KAZKA_BRAND_SUFFIX,
    outcomeBanner: 'Wynik: baner — pobierz i opublikuj ręcznie w theme/Hydrogen.',
    sourcesHint: 'Recraft utility_vector lub image model z katalogu.',
  },
] as const;

const WORKFLOW_BY_ID = new Map(OPERATOR_WORKFLOW_PRESETS.map((p) => [p.id, p]));

export function getOperatorWorkflowPreset(id: string | null | undefined): OperatorWorkflowPreset | null {
  if (!id?.trim()) return null;
  return WORKFLOW_BY_ID.get(id.trim() as OperatorWorkflowId) ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GROUP_LABELS: Record<OperatorWorkflowGroup, string> = {
  data: 'Dane',
  creative: 'Kreacja',
  production: 'Produkcja',
  storefront: 'Sklep / landing',
};

export function buildOperatorWorkflowSelectHtml(): string {
  const byGroup = new Map<OperatorWorkflowGroup, OperatorWorkflowPreset[]>();
  for (const p of OPERATOR_WORKFLOW_PRESETS) {
    const list = byGroup.get(p.group) ?? [];
    list.push(p);
    byGroup.set(p.group, list);
  }
  const parts: string[] = [];
  for (const group of ['data', 'creative', 'storefront', 'production'] as const) {
    const presets = byGroup.get(group);
    if (!presets?.length) continue;
    parts.push(`<optgroup label="${escapeHtml(GROUP_LABELS[group])}">`);
    for (const p of presets) {
      const selected = p.id === 'data_warehouse' ? ' selected' : '';
      parts.push(
        `<option value="${escapeHtml(p.id)}"${selected} title="${escapeHtml(p.description)}">${escapeHtml(p.label)}</option>`,
      );
    }
    parts.push('</optgroup>');
  }
  return parts.join('\n          ');
}

export function operatorWorkflowPresetsJson(): string {
  const map: Record<
    string,
    {
      group: string;
      agentId: string;
      modelVariant: string;
      promptSuffix: string;
      outcomeBanner: string;
      sourcesHint: string;
    }
  > = {};
  for (const p of OPERATOR_WORKFLOW_PRESETS) {
    map[p.id] = {
      group: p.group,
      agentId: p.agentId,
      modelVariant: p.modelVariant,
      promptSuffix: p.promptSuffix,
      outcomeBanner: p.outcomeBanner,
      sourcesHint: p.sourcesHint,
    };
  }
  return JSON.stringify(map);
}
