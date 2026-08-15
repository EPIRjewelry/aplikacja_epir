type VideoSource = {
  mimeType?: string | null;
  format?: string | null;
  url?: string | null;
};

function isMp4(s: VideoSource): boolean {
  const mime = s.mimeType || '';
  const format = s.format || '';
  const url = s.url || '';
  return mime.includes('mp4') || format === 'mp4' || /\.mp4(\?|$)/i.test(url);
}

/** MediaFile Hydrogen bierze pierwsze źródło — HLS (.m3u8) często się zacina. */
export function preferMp4VideoSources<T extends {sources?: VideoSource[] | null}>(
  med: T,
): T {
  const sources = med.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    return med;
  }
  const mp4 = sources.filter(isMp4);
  if (!mp4.length) {
    return med;
  }
  const preferred =
    mp4.find((s) => /1080/i.test(s.url || '')) ?? mp4[0];
  return {...med, sources: [preferred]};
}
