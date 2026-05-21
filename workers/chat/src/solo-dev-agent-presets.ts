/**
 * Presety agenta dla solo-dev-chat (Project B).
 * UI: lista rozwijana „Agent” + filtrowana lista „Model” (`X-Epir-Model-Variant`).
 * Backend: nagłówek `X-EPIR-AGENT-PRESET` dokleja addon do system prompt (internal-dashboard).
 */
import { MODEL_VARIANTS, RECRAFT_MODEL_VARIANT_KEYS, type ModelVariantKey } from './config/model-params';

const RECRAFT_KEYS = RECRAFT_MODEL_VARIANT_KEYS;

export type SoloDevAgentId =
  | 'internal_analytics'
  | 'creative_svg'
  | 'creative_copy'
  | 'creative_image'
  | 'creative_blender_flow';

export type SoloDevAgentPreset = {
  readonly id: SoloDevAgentId;
  readonly optgroup: string;
  readonly label: string;
  readonly description: string;
  /** Domyślny klucz wariantu modelu (pusty = Groq default). */
  readonly defaultModelVariant: '' | ModelVariantKey;
  /** Dozwolone warianty w UI (kolejność = kolejność w &lt;select&gt;). */
  readonly modelVariants: readonly ('' | ModelVariantKey)[];
  /** Dodatek do INTERNAL_DASHBOARD_SYSTEM_PROMPT (pusty = tylko baza). */
  readonly systemAddon: string;
};

const ALL_VARIANTS: readonly ('' | ModelVariantKey)[] = [
  '',
  'kimi_k25',
  'k26',
  'glm_flash',
  'qwen3_30b_a3b',
  'gemma4_26b',
  'scout_17b',
  'or_gpt4o',
  'or_gpt4o_mini',
  'or_claude3_opus',
  'or_gemini_pro',
  'or_gemini2_flash',
  'or_deepseek_v4',
  'or_llama31_405b',
  'or_llama70b',
  'or_mistral7b',
  'or_claude_sonnet_4',
  'or_gpt41',
  ...RECRAFT_KEYS,
];

const TEXT_OR: readonly ('' | ModelVariantKey)[] = [
  '',
  'or_gpt4o',
  'or_gpt4o_mini',
  'or_gpt41',
  'or_claude_sonnet_4',
  'or_claude3_opus',
  'or_gemini2_flash',
  'or_deepseek_v4',
  'glm_flash',
  'qwen3_30b_a3b',
];

const MULTIMODAL_OR: readonly ('' | ModelVariantKey)[] = [
  '',
  'or_gpt4o',
  'or_gpt4o_mini',
  'or_gpt41',
  'or_claude_sonnet_4',
  'or_gemini_pro',
  'or_gemini2_flash',
  'kimi_k25',
  'gemma4_26b',
  ...RECRAFT_KEYS,
];

const RECRAFT_IMAGE: readonly ('' | ModelVariantKey)[] = ['', ...RECRAFT_KEYS];

const RECRAFT_VECTOR: readonly ('' | ModelVariantKey)[] = [
  '',
  'or_recraft_v41_vector',
  'or_recraft_v41_pro_vector',
  'or_recraft_v41_utility_vector',
  'or_recraft_v41_utility_pro_vector',
  'or_claude_sonnet_4',
  'or_gpt4o',
];

const SVG_MODELS: readonly ('' | ModelVariantKey)[] = [
  '',
  'or_claude_sonnet_4',
  'or_claude3_opus',
  'or_gpt4o',
  'or_gpt41',
  'or_gemini2_flash',
  'or_deepseek_v4',
  'glm_flash',
  ...RECRAFT_VECTOR.filter((k) => k !== ''),
];

export const SOLO_DEV_AGENT_PRESETS: readonly SoloDevAgentPreset[] = [
  {
    id: 'internal_analytics',
    optgroup: 'Project B — operacje',
    label: 'Analityka / kampanie (domyślny)',
    description: 'Hurtownia, GA4/Ads, ShopifyQL — bez zmiany roli bazowej.',
    defaultModelVariant: '',
    modelVariants: ALL_VARIANTS,
    systemAddon: '',
  },
  {
    id: 'creative_svg',
    optgroup: 'Project B — projektowanie',
    label: 'SVG / layout (Flow → krzywe)',
    description: 'Ścieżki, viewBox, grupy — pod import SVG do Blendera.',
    defaultModelVariant: 'or_claude_sonnet_4',
    modelVariants: SVG_MODELS,
    systemAddon: `
TRYB: Projektant SVG / layout (biżuteria EPIR, materiały reklamowe).
- Generuj **czytelny SVG** (grupy, nazwy warstw, atrybut viewBox, bez zbędnego rasteru).
- Zakładaj pipeline: **SVG → Blender** (import curve → convert to mesh / Geometry Nodes).
- Używaj **materiałów operatora** z wiadomości (referencje, wymiary); nie wymyślaj marki sprzecznej z briefem.
- Na końcu: krótka lista kroków w Blenderze (import, scale mm, convert curve, grubość).
`.trim(),
  },
  {
    id: 'creative_copy',
    optgroup: 'Project B — projektowanie',
    label: 'Copy / brief reklamowy',
    description: 'Hasła, warianty A/B, opisy pod kreację.',
    defaultModelVariant: 'or_gpt4o_mini',
    modelVariants: TEXT_OR,
    systemAddon: `
TRYB: Copywriter / brief pod kampanie (Google Ads, social, e-mail).
- Ton: luksusowa biżuteria EPIR, konkret, bez przesady.
- Dostarcz: 2–3 warianty nagłówka, lead, CTA, uwagi do formatu (kwadrat / stories / search).
- Nie podawaj sekretów API ani wewnętrznych URL-i.
`.trim(),
  },
  {
    id: 'creative_image',
    optgroup: 'Project B — projektowanie',
    label: 'Moodboard / kierunek wizualny',
    description: 'Opisy wizualne, kompozycja banerów (modele multimodal).',
    defaultModelVariant: 'or_recraft_v41_utility',
    modelVariants: [...RECRAFT_IMAGE, 'or_gpt4o', 'or_claude_sonnet_4'],
    systemAddon: `
TRYB: Dyrektor artystyczny — moodboard i kierunek wizualny (reklama, packshot).
- Modele Recraft V4.1 generują obraz/SVG przez OpenRouter (modalities image); opisz brief wizualnie po polsku.
- Opisuj światło, kompozycję, materiał (srebro, kamienie), tło, proporcje kadru.
- Jeśli operator dołączy obraz — odnieś się do niego; nie udawaj renderu CAD.
- Proponuj 2–3 warianty klimatu + checklistę do realizacji w DTP/Blenderze.
`.trim(),
  },
  {
    id: 'creative_blender_flow',
    optgroup: 'Project B — projektowanie',
    label: 'Blender: curve → mesh',
    description: 'Instrukcje bpy / workflow (bez zastępowania Blender MCP).',
    defaultModelVariant: 'or_gpt4o',
    modelVariants: ['', 'or_gpt4o', 'or_gpt4o_mini', 'or_claude3_opus', 'or_gemini2_flash', 'glm_flash'],
    systemAddon: `
TRYB: Asystent workflow Blender (metryczne mm, biżuteria).
- Priorytet: **curve z SVG** → **Convert to Mesh** → modyfikatory (solidify/bevel) z uzasadnieniem.
- Podawaj kroki kompatybilne z Blender 4.x; gdy potrzebny skrypt — krótki snippet bpy, bez destrukcyjnych operacji bez potwierdzenia.
- Odniesienia do kolekcji Shop_Studio / packshot tylko jeśli operator o to prosi.
`.trim(),
  },
] as const;

const PRESET_BY_ID = new Map(SOLO_DEV_AGENT_PRESETS.map((p) => [p.id, p]));

export function isSoloDevAgentId(value: string): value is SoloDevAgentId {
  return PRESET_BY_ID.has(value as SoloDevAgentId);
}

export function getSoloDevAgentPreset(id: string | null | undefined): SoloDevAgentPreset | null {
  if (!id) return null;
  const key = id.trim();
  if (!key || !isSoloDevAgentId(key)) return null;
  return PRESET_BY_ID.get(key) ?? null;
}

export function getSoloDevAgentSystemAddon(id: string | null | undefined): string {
  return getSoloDevAgentPreset(id)?.systemAddon ?? '';
}

function modelOptionLabel(variantKey: '' | ModelVariantKey): string {
  if (variantKey === '') {
    return 'default — GPT-OSS-120B (Groq / AI Gateway)';
  }
  const cap = MODEL_VARIANTS[variantKey];
  return `${variantKey} — ${cap.label ?? cap.id}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML &lt;option&gt; dla jednego agenta (0..n grup w select). */
export function buildSoloDevAgentSelectHtml(): string {
  const byGroup = new Map<string, SoloDevAgentPreset[]>();
  for (const p of SOLO_DEV_AGENT_PRESETS) {
    const list = byGroup.get(p.optgroup) ?? [];
    list.push(p);
    byGroup.set(p.optgroup, list);
  }
  const parts: string[] = [];
  for (const [group, presets] of byGroup) {
    parts.push(`<optgroup label="${escapeHtml(group)}">`);
    for (const p of presets) {
      const selected = p.id === 'internal_analytics' ? ' selected' : '';
      parts.push(
        `<option value="${escapeHtml(p.id)}"${selected} title="${escapeHtml(p.description)}">${escapeHtml(p.label)}</option>`,
      );
    }
    parts.push('</optgroup>');
  }
  return parts.join('\n        ');
}

/** Pełna lista modeli z optgroup (filtrowana w JS wg agenta). */
export function buildSoloDevModelSelectHtml(): string {
  const workers: ('' | ModelVariantKey)[] = [
    '',
    'kimi_k25',
    'k26',
    'glm_flash',
    'qwen3_30b_a3b',
    'gemma4_26b',
    'scout_17b',
  ];
  const orText: ModelVariantKey[] = [
    'or_gpt4o',
    'or_gpt4o_mini',
    'or_gpt41',
    'or_claude_sonnet_4',
    'or_claude3_opus',
    'or_gemini2_flash',
    'or_deepseek_v4',
    'or_llama31_405b',
    'or_llama70b',
    'or_mistral7b',
  ];
  const orMulti: ModelVariantKey[] = [
    'or_gemini_pro',
    'or_gpt4o',
    'or_gpt4o_mini',
    'or_gpt41',
    'or_claude_sonnet_4',
    'or_gemini2_flash',
  ];
  const recraft: ModelVariantKey[] = [...RECRAFT_KEYS];

  const chunk = (keys: readonly ('' | ModelVariantKey)[]) =>
    keys
      .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(modelOptionLabel(k))}</option>`)
      .join('\n          ');

  return `<optgroup label="Domyślny (Groq / Workers AI)">
          ${chunk(workers)}
        </optgroup>
        <optgroup label="OpenRouter — tekst / reasoning">
          ${chunk(orText)}
        </optgroup>
        <optgroup label="OpenRouter — multimodal (obraz wejściowy)">
          ${chunk(['', ...orMulti.filter((k, i, a) => a.indexOf(k) === i)])}
        </optgroup>
        <optgroup label="OpenRouter — Recraft V4.1 (generacja obrazu / SVG)">
          ${chunk(recraft)}
        </optgroup>`;
}

/** JSON do filtrowania modeli w przeglądarce (agentId → dozwolone variant keys). */
export function soloDevAgentModelMapJson(): string {
  const map: Record<string, string[]> = {};
  for (const p of SOLO_DEV_AGENT_PRESETS) {
    map[p.id] = p.modelVariants.map((v) => v);
  }
  return JSON.stringify(map);
}

export function soloDevAgentDefaultsJson(): string {
  const map: Record<string, string> = {};
  for (const p of SOLO_DEV_AGENT_PRESETS) {
    map[p.id] = p.defaultModelVariant;
  }
  return JSON.stringify(map);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Addon system prompt tylko przy Bearer = `EPIR_OPERATOR_PANEL_SECRET` (jak override modelu). */
export function resolveSoloDevAgentAddonFromHeaders(
  headers: { get(name: string): string | null },
  env: { EPIR_OPERATOR_PANEL_SECRET?: string },
): string {
  const raw = headers.get('x-epir-agent-preset') ?? headers.get('X-EPIR-AGENT-PRESET');
  if (!raw?.trim()) return '';

  const configured = env.EPIR_OPERATOR_PANEL_SECRET?.trim() ?? '';
  if (!configured) return '';

  const rawAuth = headers.get('Authorization') ?? headers.get('authorization');
  const m = /^Bearer\s+(.+)$/i.exec((rawAuth ?? '').trim());
  const bearer = m?.[1]?.trim();
  if (!bearer || !timingSafeEqualStrings(bearer, configured)) return '';

  return getSoloDevAgentSystemAddon(raw);
}
