import { describe, expect, it } from 'vitest';
import { pixelCreatedAtIso, pixelCreatedAtMs } from './d1-timestamps';

describe('pixelCreatedAtMs', () => {
  it('parses INTEGER ms from D1', () => {
    expect(pixelCreatedAtMs(1761723289000)).toBe(1761723289000);
  });

  it('parses numeric string ms', () => {
    expect(pixelCreatedAtMs('1761723289000')).toBe(1761723289000);
  });

  it('parses ISO text', () => {
    const iso = '2026-01-15T12:00:00.000Z';
    expect(pixelCreatedAtMs(iso)).toBe(Date.parse(iso));
  });

  it('pixelCreatedAtIso returns ISO from ms integer', () => {
    expect(pixelCreatedAtIso(1761723289000)).toBe(new Date(1761723289000).toISOString());
  });
});
