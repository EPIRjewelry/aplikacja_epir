type MediaLike = {
  mediaContentType?: string | null;
  __typename?: string | null;
  sources?: Array<{url?: string | null; mimeType?: string | null}> | null;
};

export function isProductVideo(med: MediaLike): boolean {
  const type = med.mediaContentType ?? '';
  const name = med.__typename ?? '';
  if (type === 'VIDEO' || type === 'EXTERNAL_VIDEO') return true;
  if (name === 'Video' || name === 'ExternalVideo') return true;
  const sources = med.sources;
  if (!Array.isArray(sources) || sources.length === 0) return false;
  return sources.some((s) => {
    const mime = s.mimeType || '';
    const url = s.url || '';
    return (
      mime.includes('mp4') ||
      mime.includes('mpegURL') ||
      mime.includes('mpegurl') ||
      /\.(mp4|m3u8)(\?|$)/i.test(url)
    );
  });
}

/** Pierwsze zdjęcie, potem pierwszy film, potem reszta. */
export function orderProductMedia<T extends MediaLike>(medias: T[]): T[] {
  const videos = medias.filter((m) => isProductVideo(m));
  const rest = medias.filter((m) => !isProductVideo(m));
  if (videos.length === 0 || rest.length === 0) {
    return medias;
  }
  return [rest[0], videos[0], ...rest.slice(1), ...videos.slice(1)];
}
