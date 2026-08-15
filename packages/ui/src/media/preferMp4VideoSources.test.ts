import {describe, expect, it} from 'vitest';
import {preferMp4VideoSources} from './preferMp4VideoSources';

describe('preferMp4VideoSources', () => {
  it('drops HLS and keeps 1080p mp4', () => {
    const out = preferMp4VideoSources({
      sources: [
        {mimeType: 'application/x-mpegURL', url: 'https://cdn.example/a.m3u8'},
        {mimeType: 'video/mp4', url: 'https://cdn.example/a.HD-720p.mp4'},
        {mimeType: 'video/mp4', url: 'https://cdn.example/a.HD-1080p.mp4'},
      ],
    });
    expect(out.sources).toEqual([
      {mimeType: 'video/mp4', url: 'https://cdn.example/a.HD-1080p.mp4'},
    ]);
  });
});
