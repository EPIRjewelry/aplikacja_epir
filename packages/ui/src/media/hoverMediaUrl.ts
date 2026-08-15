import {preferMp4VideoSources} from './preferMp4VideoSources';
import {isProductVideo, orderProductMedia} from './orderProductMedia';

export type CardMediaNode = {
  mediaContentType?: string | null;
  __typename?: string | null;
  image?: {url?: string | null} | null;
  sources?: Array<{url?: string | null; mimeType?: string | null; format?: string | null}> | null;
};

export type HoverMedia = {kind: 'video' | 'image'; url: string};

/** Hover na karcie: zawsze pierwszy film, nie drugie zdjęcie. */
export function hoverMedia(medias: CardMediaNode[] | undefined): HoverMedia | null {
  if (!medias?.length) return null;
  const video = medias.find((m) => isProductVideo(m));
  if (video) {
    const mp4 = preferMp4VideoSources(video).sources?.[0]?.url;
    if (mp4) return {kind: 'video', url: mp4};
  }
  const second = orderProductMedia(medias)[1];
  const url = second?.image?.url;
  return url ? {kind: 'image', url} : null;
}
