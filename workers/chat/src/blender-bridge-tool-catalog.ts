/**
 * Mirror of Blender_assist/docs/BLENDER_BRIDGE_TOOLS.json (SSOT: relay/tool_catalog.py).
 * Po dodaniu @mcp.tool uruchom: Blender_assist/scripts/export_bridge_tool_catalog.py
 * i skopiuj JSON do workers/chat/src/blender-bridge-tools.json.
 */
import catalog from './blender-bridge-tools.json';

export type BlenderBridgeCatalog = typeof catalog;

export const BLENDER_BRIDGE_TOOL_CATALOG = catalog;

export const BLENDER_BRIDGE_DENYLIST = catalog.denied as readonly string[];

export const BLENDER_BRIDGE_TOOL_ALIASES = catalog.aliases as Readonly<Record<string, string>>;

export const BLENDER_BRIDGE_TOOL_NAMES = catalog.tools.map((t) => t.name) as readonly string[];

/** Enum dla schematu LLM: kanoniczne nazwy + aliasy (np. blender_add_curve). */
export function blenderBridgeToolEnumForSchema(): string[] {
  const names = new Set<string>(BLENDER_BRIDGE_TOOL_NAMES);
  for (const alias of Object.keys(BLENDER_BRIDGE_TOOL_ALIASES)) {
    names.add(alias);
  }
  return [...names].sort();
}

export function resolveBridgeToolName(toolName: string): string {
  const raw = toolName.trim();
  return BLENDER_BRIDGE_TOOL_ALIASES[raw] ?? raw;
}

export function isBlenderBridgeToolDenied(toolName: string): boolean {
  const resolved = resolveBridgeToolName(toolName);
  return (BLENDER_BRIDGE_DENYLIST as readonly string[]).includes(resolved);
}

export function isBlenderBridgeToolKnown(toolName: string): boolean {
  const resolved = resolveBridgeToolName(toolName);
  return (BLENDER_BRIDGE_TOOL_NAMES as readonly string[]).includes(resolved);
}

/** Krótka lista dla promptów operatora (nazwy + 1 linia opisu). */
export function blenderBridgeToolCatalogForPrompt(maxTools = 30): string {
  return catalog.tools
    .slice(0, maxTools)
    .map((t) => `- ${t.name}: ${t.summary}`)
    .join('\n');
}
