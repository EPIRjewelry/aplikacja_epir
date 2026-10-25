import { describe, expect, it } from 'vitest';
import {
  INPSA_OAUTH_SCOPES,
  buildOrderRelativePath,
  buildOrdersEventsRelativePath,
  joinInpsaApiUrl,
  parseInpsaEnv,
  resolveInpsaHosts,
  resolveInpsaOrganizationId,
} from './inpsa-config';

describe('parseInpsaEnv', () => {
  it('defaults to stage', () => {
    expect(parseInpsaEnv(undefined)).toBe('stage');
    expect(parseInpsaEnv('stage')).toBe('stage');
    expect(parseInpsaEnv('staging')).toBe('stage');
  });

  it('accepts production aliases', () => {
    expect(parseInpsaEnv('production')).toBe('production');
    expect(parseInpsaEnv('prod')).toBe('production');
  });

  it('rejects unknown values', () => {
    expect(() => parseInpsaEnv('sandbox')).toThrow(/Unsupported INPSA_ENV/);
  });
});

describe('resolveInpsaHosts', () => {
  it('returns stage hosts', () => {
    const hosts = resolveInpsaHosts('stage');
    expect(hosts.tokenUrl).toBe('https://stage-account.inpost-group.com/oauth2/token');
    expect(hosts.apiBase).toBe('https://stage-api.inpost-group.com/inpsa/');
  });

  it('returns production hosts', () => {
    const hosts = resolveInpsaHosts('production');
    expect(hosts.tokenUrl).toBe('https://account.inpost-group.com/oauth2/token');
    expect(hosts.apiBase).toBe('https://api.inpost-group.com/inpsa/');
  });
});

describe('joinInpsaApiUrl', () => {
  it('joins base and relative path', () => {
    expect(
      joinInpsaApiUrl(
        'https://stage-api.inpost-group.com/inpsa/',
        'v1/organizations/org-1/orders/events',
      ),
    ).toBe('https://stage-api.inpost-group.com/inpsa/v1/organizations/org-1/orders/events');
  });
});

describe('buildOrdersEventsRelativePath', () => {
  it('matches portal OpenAPI organization-scoped path', () => {
    expect(buildOrdersEventsRelativePath('merchant-org-uuid')).toBe(
      'v1/organizations/merchant-org-uuid/orders/events',
    );
  });
});

describe('buildOrderRelativePath', () => {
  it('matches portal OpenAPI order detail path', () => {
    expect(buildOrderRelativePath('org-1', 'AB12345')).toBe(
      'v1/organizations/org-1/orders/AB12345',
    );
  });
});

describe('resolveInpsaOrganizationId', () => {
  it('requires non-empty id', () => {
    expect(resolveInpsaOrganizationId('  org-9  ')).toBe('org-9');
    expect(() => resolveInpsaOrganizationId(undefined)).toThrow(/INPSA_ORGANIZATION_ID/);
  });
});

describe('INPSA_OAUTH_SCOPES', () => {
  it('matches ADR 0002 scope list', () => {
    expect(INPSA_OAUTH_SCOPES).toContain('api:orders:read');
    expect(INPSA_OAUTH_SCOPES).toContain('openid');
  });
});
