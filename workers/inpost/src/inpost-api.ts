/// <reference types="@cloudflare/workers-types" />

import type { Env } from './env';

/** ShipX API response shape for a single point. */
interface ShipXPoint {
  href: string;
  name: string;
  type: string[];
  status: string;
  location: { longitude: number; latitude: number };
  address: { line1: string; line2: string };
  address_details: { city: string; province: string; post_code: string; street: string; building_number: string; flat_number: string | null };
  opening_hours: string | null;
  functions: string[];
  physical_type: string;
}

/** Normalized point shape returned by the worker. */
export interface InpostPoint {
  code: string;
  name: string;
  address: {
    street: string;
    city: string;
    postcode: string;
    country: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  type: 'parcel_locker' | 'pickup_point';
  active: boolean;
  opening_hours?: string;
}

export interface FetchPointsParams {
  country?: string;
  city?: string;
  query?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
}

export class InpostApiClient {
  private env: Env;
  private tokenCache: Map<string, { token: string; expiresAt: number }>;

  constructor(env: Env) {
    this.env = env;
    this.tokenCache = new Map();
  }

  private get baseUrl(): string {
    // ShipX API (legacy PL) — token has api:shipx scope.
    // Requires organization ID in path: /v1/organizations/:id/points
    return this.env.INPOST_ENV === 'sandbox'
      ? 'https://sandbox-api-shipx-pl.easypack24.net'
      : 'https://api-shipx-pl.easypack24.net';
  }

  private get tokenCacheKey(): string {
    return `inpost_token:${this.env.INPOST_ENV}`;
  }

  /**
   * Gets a valid access token.
   * Uses static INPOST_ACCESS_TOKEN if available, otherwise falls back to OAuth2.
   */
  async getToken(): Promise<string> {
    // Static token from env var/secret — preferred path for MVP.
    if (this.env.INPOST_ACCESS_TOKEN) {
      const token = this.env.INPOST_ACCESS_TOKEN;
      const expiry = this.parseJwtExpiry(token);
      this.tokenCache.set(this.tokenCacheKey, { token, expiresAt: expiry });
      return token;
    }

    // In-memory cache check
    const now = Date.now();
    const cached = this.tokenCache.get(this.tokenCacheKey);
    if (cached && cached.expiresAt - now > 30000) {
      return cached.token;
    }

    // Request new token via OAuth2 client_credentials
    const token = await this.fetchToken();
    this.tokenCache.set(this.tokenCacheKey, { token, expiresAt: now + 3600000 });
    return token;
  }

  /** Decode JWT payload and return expiry in milliseconds. Falls back to +1h if parsing fails. */
  private parseJwtExpiry(token: string): number {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload)) as { exp?: number };
      if (decoded.exp) return decoded.exp * 1000;
    } catch {
      // ignore
    }
    return Date.now() + 3600000;
  }

  private async fetchToken(): Promise<string> {
    const url = `${this.baseUrl}/oauth2/token`;

    // For client_credentials flow
    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('scope', 'openid api:apipoints');

    const clientId = this.env.INPOST_CLIENT_ID;
    const clientSecret = this.env.INPOST_CLIENT_SECRET;
    const basicAuth = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get InPost token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in?: number };

    // Adjust expiry based on actual response
    const expiresIn = data.expires_in || 3600;
    this.tokenCache.set(this.tokenCacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn * 1000),
    });

    return data.access_token;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await this.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /** Map ShipX API point to normalized InpostPoint. */
  private mapPoint(raw: ShipXPoint): InpostPoint {
    const code = raw.href.split('/').pop() || raw.name;
    return {
      code,
      name: raw.name,
      address: {
        street: `${raw.address.line1}${raw.address.line2 ? ' ' + raw.address.line2 : ''}`,
        city: raw.address_details.city,
        postcode: raw.address_details.post_code,
        country: 'PL',
      },
      coordinates: {
        latitude: raw.location.latitude,
        longitude: raw.location.longitude,
      },
      type: raw.type.includes('parcel_locker') ? 'parcel_locker' : 'pickup_point',
      active: raw.status === 'Operating',
      opening_hours: raw.opening_hours || undefined,
    };
  }

  async fetchPoints(params: FetchPointsParams): Promise<InpostPoint[]> {
    // ShipX API: /v1/points
    const url = new URL(`${this.baseUrl}/v1/points`);

    if (params.country) url.searchParams.set('country', params.country);
    if (params.city) url.searchParams.set('city', params.city);
    if (params.query) url.searchParams.set('query', params.query);
    if (params.latitude != null) url.searchParams.set('latitude', String(params.latitude));
    if (params.longitude != null) url.searchParams.set('longitude', String(params.longitude));
    if (params.radius != null) url.searchParams.set('radius', String(params.radius));

    const response = await fetch(url.toString(), {
      headers: await this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch points: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { items?: ShipXPoint[] };
    const points = (data.items || []).map(p => this.mapPoint(p));
    // Filter out invalid/mock data (lat=0, lng=0 means no real coordinates)
    return points.filter(p =>
      p.coordinates &&
      p.coordinates.latitude !== 0 &&
      p.coordinates.longitude !== 0
    );
  }

  async fetchPoint(code: string): Promise<InpostPoint | null> {
    const url = `${this.baseUrl}/v1/points/${encodeURIComponent(code)}`;

    const response = await fetch(url, {
      headers: await this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch point: ${response.status} ${response.statusText}`);
    }

    const raw = await response.json() as ShipXPoint;
    return this.mapPoint(raw);
  }
}
