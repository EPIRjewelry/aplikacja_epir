import {describe, expect, it} from 'vitest';
import type {Env} from '../src/env';
import {
  isLandingPreviewRequest,
  shouldRenderLandings,
} from '../src/landing-preview';

const env = {
  LANDINGS_ENABLED: 'false',
  EPIR_OPERATOR_PANEL_SECRET: 'op-secret',
  MARKETING_OPS_PREVIEW_KEY: 'mkt-preview',
} as unknown as Env;

describe('landing-preview', () => {
  it('renders when LANDINGS_ENABLED=true', () => {
    expect(
      shouldRenderLandings(
        new Request('https://l.epirbizuteria.pl/?utm_campaign=organic_art'),
        {...env, LANDINGS_ENABLED: 'true'} as Env,
      ),
    ).toBe(true);
  });

  it('blocks public traffic when landings off', () => {
    expect(
      shouldRenderLandings(
        new Request('https://l.epirbizuteria.pl/?utm_campaign=organic_art'),
        env,
      ),
    ).toBe(false);
  });

  it('allows operator preview via epir_preview query', () => {
    const req = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=organic_art&epir_preview=op-secret',
    );
    expect(isLandingPreviewRequest(req, env)).toBe(true);
    expect(shouldRenderLandings(req, env)).toBe(true);
  });

  it('allows operator preview via X-Admin-Key', () => {
    const req = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=forest_premium',
      {headers: {'X-Admin-Key': 'op-secret'}},
    );
    expect(shouldRenderLandings(req, env)).toBe(true);
  });

  it('allows operator preview via Bearer marketing key', () => {
    const req = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=artisan_gold',
      {headers: {Authorization: 'Bearer mkt-preview'}},
    );
    expect(shouldRenderLandings(req, env)).toBe(true);
  });

  it('allows operator preview via session cookie', () => {
    const req = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=organic_art',
      {headers: {Cookie: 'epir_landing_preview=op-secret'}},
    );
    expect(shouldRenderLandings(req, env)).toBe(true);
  });

  it('rejects wrong preview token', () => {
    const req = new Request(
      'https://l.epirbizuteria.pl/?utm_campaign=organic_art&epir_preview=wrong',
    );
    expect(isLandingPreviewRequest(req, env)).toBe(false);
  });
});
