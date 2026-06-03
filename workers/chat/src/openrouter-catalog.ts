/**
 * OpenRouter model catalog (server-side proxy + cache).
 * Operator Studio — pełna lista modeli bez hardcodu w MODEL_VARIANTS.
 */
import type { ModelCapabilities } from './config/model-params';

export type OpenRouterCatalogEntry = {
  readonly id: string;
  readonly name: string;
  readonly multimodal: boolean;
  readonly imageGen: boolean;
  readonly contextLength: number | null;
};

type CatalogCache = {
  fetchedAt: number;
  models: OpenRouterCatalogEntry[];
};

const CACHE_TTL_MS = 30 * 60 * 1000;
let catalogCache: CatalogCache | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function modalityList(arch: Record<string, unknown>, key: 'input_modalities' | 'output_modalities'): string[] {
  const raw = arch[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string').map((s) => s.toLowerCase());
}

function classifyEntry(id: string, arch: Record<string, unknown> | null): Pick<OpenRouterCatalogEntry, 'multimodal' | 'imageGen'> {
  const slug = id.toLowerCase();
  const inputs = arch ? modalityList(arch, 'input_modalities') : [];
  const outputs = arch ? modalityList(arch, 'output_modalities') : [];

  const imageGen =
    outputs.includes('image') ||
    slug.startsWith('recraft/') ||
    /\/flux|stable-diffusion|dall-e|image-preview/i.test(slug);

  const multimodal = inputs.includes('image') || imageGen || inputs.includes('file');

  return { multimodal, imageGen };
}

function parseModelsPayload(json: unknown): OpenRouterCatalogEntry[] {
  if (!isRecord(json)) return [];
  const data = json.data;
  if (!Array.isArray(data)) return [];

  const out: OpenRouterCatalogEntry[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || !id.includes('/')) continue;
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id;
    const arch = isRecord(row.architecture) ? row.architecture : null;
    const ctx =
      typeof row.context_length === 'number' && Number.isFinite(row.context_length)
        ? row.context_length
        : null;
    const { multimodal, imageGen } = classifyEntry(id, arch);
    out.push({ id, name, multimodal, imageGen, contextLength: ctx });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return out;
}

export async function fetchOpenRouterCatalog(apiKey: string): Promise<OpenRouterCatalogEntry[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const now = Date.now();
  if (catalogCache && now - catalogCache.fetchedAt < CACHE_TTL_MS) {
    return catalogCache.models;
  }

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter models HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json: unknown = await res.json();
  const models = parseModelsPayload(json);
  catalogCache = { fetchedAt: now, models };
  return models;
}

/** Test-only: reset in-memory cache. */
export function __resetOpenRouterCatalogCacheForTests(): void {
  catalogCache = null;
}

export function findCatalogEntry(
  catalog: readonly OpenRouterCatalogEntry[],
  modelId: string,
): OpenRouterCatalogEntry | null {
  const needle = modelId.trim();
  if (!needle) return null;
  return catalog.find((m) => m.id === needle) ?? null;
}

export function catalogEntryToCapabilities(entry: OpenRouterCatalogEntry): ModelCapabilities {
  return {
    id: `openrouter/${entry.id}`,
    multimodal: entry.multimodal,
    toolLeak: false,
    imageGen: entry.imageGen,
    label: `${entry.name} (OpenRouter)`,
  };
}

export function isValidOpenRouterModelId(modelId: string): boolean {
  const s = modelId.trim();
  if (!s || s.length > 120) return false;
  if (s.startsWith('openrouter/')) return false;
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(s);
}
