import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const runtimePath = join(repoRoot, 'extensions/asystent-klienta/assets/assistant-runtime.js');
const cssPath = join(repoRoot, 'extensions/asystent-klienta/assets/assistant.css');
const embedPath = join(repoRoot, 'extensions/asystent-klienta/blocks/assistant-embed.liquid');
const sectionPath = join(repoRoot, 'extensions/asystent-klienta/blocks/assistant-section.liquid');

function loadRuntime() {
  const listeners: Record<string, Array<(ev?: unknown) => void>> = {};
  const sandbox: Record<string, unknown> = {
    document: {
      cookie: '',
      readyState: 'loading',
      body: null,
      addEventListener(type: string, fn: (ev?: unknown) => void) {
        (listeners[type] ||= []).push(fn);
      },
      removeEventListener() {},
      getElementById() {
        return null;
      },
      createElement() {
        return { setAttribute() {}, appendChild() {}, className: '', textContent: '' };
      },
    },
    window: { location: { hostname: 'epirbizuteria.pl', pathname: '/' } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    console,
    fetch: async () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' }),
    crypto: { randomUUID: () => 'anon-1' },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    AbortController,
    performance: { now: () => 0 },
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Promise,
    WeakMap,
    decodeURIComponent,
    encodeURIComponent,
  };
  vm.runInNewContext(readFileSync(runtimePath, 'utf8'), sandbox, {
    filename: 'assistant-runtime.js',
  });
  return sandbox;
}

describe('Czat launcher visibility', () => {
  it('hides the existing launcher while the panel is open and shows it when closed', () => {
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('.assistant-container:has(.assistant-panel:not(.is-closed)) > .epir-assistant-launcher');
    expect(css).toContain('.epir-assistant-launcher[hidden]');

    const embed = readFileSync(embedPath, 'utf8');
    const section = readFileSync(sectionPath, 'utf8');
    expect(embed).not.toContain('epir-assistant-consent-checkbox');
    expect(section).not.toContain('epir-assistant-consent-checkbox');
    expect(embed.match(/class="epir-assistant-launcher"/g)).toHaveLength(1);
    expect(section.match(/class="epir-assistant-launcher"/g)).toHaveLength(1);

    const runtime = loadRuntime();
    const sync = runtime.syncCzatLauncherVisibility as (section: {
      querySelector: (sel: string) => unknown;
    }) => void;
    const launcherAttrs: Record<string, string> = {};
    const panelClasses = new Set(['is-closed']);
    const launcher = {
      setAttribute(name: string, value: string) {
        launcherAttrs[name] = value;
      },
      removeAttribute(name: string) {
        delete launcherAttrs[name];
      },
      getAttribute(name: string) {
        return launcherAttrs[name] ?? null;
      },
    };
    const panel = {
      classList: {
        contains(name: string) {
          return panelClasses.has(name);
        },
      },
    };
    const widget = {
      querySelector(sel: string) {
        if (sel === '#assistant-launcher-embed') return launcher;
        if (sel === '#assistant-panel-embed') return panel;
        return null;
      },
    };

    sync(widget);
    expect(launcher.getAttribute('hidden')).toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('false');

    panelClasses.delete('is-closed');
    sync(widget);
    expect(launcher.getAttribute('hidden')).toBe('');
    expect(launcher.getAttribute('aria-expanded')).toBe('true');

    panelClasses.add('is-closed');
    sync(widget);
    expect(launcher.getAttribute('hidden')).toBeNull();
    expect(launcher.getAttribute('aria-expanded')).toBe('false');
  });
});
