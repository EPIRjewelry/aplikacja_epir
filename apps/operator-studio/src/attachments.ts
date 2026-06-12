export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
/** Suma rozmiarów plików w jednej wiadomości (przed base64). */
export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export type AttachmentKind = 'image' | 'audio' | 'video' | 'text';

export type PendingAttachment = {
  id: string;
  name: string;
  kind: AttachmentKind;
  mediaType: string;
  size: number;
  /** data: URI lub surowy tekst (CSV/txt) */
  payload: string;
  previewUrl?: string;
};

const TEXT_MIME = new Set([
  'text/plain',
  'text/csv',
  'application/csv',
  'text/tab-separated-values',
  'application/json',
  'text/markdown',
]);

const TEXT_EXT = /\.(csv|tsv|txt|md|json)$/i;

function classifyFile(file: File): AttachmentKind | null {
  const mt = (file.type || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('audio/')) return 'audio';
  if (mt.startsWith('video/')) return 'video';
  if (TEXT_MIME.has(mt) || TEXT_EXT.test(file.name)) return 'text';
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Nie udało się odczytać: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Nie udało się odczytać: ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

export async function fileToAttachment(file: File): Promise<PendingAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`„${file.name}” przekracza limit 4 MB.`);
  }
  const kind = classifyFile(file);
  if (!kind) {
    throw new Error(`Nieobsługiwany typ pliku: ${file.name} (${file.type || 'brak MIME'})`);
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const mediaType = file.type || (kind === 'text' ? 'text/plain' : 'application/octet-stream');

  if (kind === 'text') {
    const text = await readFileAsText(file);
    return { id, name: file.name, kind, mediaType, size: file.size, payload: text };
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    id,
    name: file.name,
    kind,
    mediaType,
    size: file.size,
    payload: dataUrl,
    previewUrl: kind === 'image' || kind === 'audio' || kind === 'video' ? dataUrl : undefined,
  };
}

export type BuiltMessagePayload = {
  message: string;
  imageBase64?: string;
  parts?: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
};

/** Składa wiadomość + pola API z załączników (bez zmian w workerze poza istniejącym `parts` / `image_base64`). */
export function buildMessageWithAttachments(
  userText: string,
  attachments: PendingAttachment[],
): BuiltMessagePayload {
  const blocks: string[] = [];
  let imageBase64: string | undefined;
  const parts: BuiltMessagePayload['parts'] = [];

  if (userText.trim()) {
    parts.push({ type: 'text', text: userText.trim() });
  }

  for (const a of attachments) {
    if (a.kind === 'image' && !imageBase64) {
      imageBase64 = a.payload;
      const b64 = a.payload.includes(',') ? a.payload.split(',')[1]! : a.payload;
      parts.push({ type: 'file', data: b64, mediaType: a.mediaType || 'image/png' });
      blocks.push(`[Obraz: ${a.name}]`);
      continue;
    }
    if (a.kind === 'image') {
      blocks.push(`[Dodatkowy obraz pominięty w tej turze — tylko pierwszy idzie do modelu: ${a.name}]`);
      continue;
    }
    if (a.kind === 'text') {
      const capped = a.payload.length > 120_000 ? `${a.payload.slice(0, 120_000)}\n…(ucięto)` : a.payload;
      blocks.push(`\n---\n**Załącznik: ${a.name}**\n\`\`\`\n${capped}\n\`\`\``);
      continue;
    }
    if (a.kind === 'audio' || a.kind === 'video') {
      // Nie wysyłamy audio/wideo w `parts` — worker mapuje parts/file tylko na obraz (image_base64).
      blocks.push(
        `[${a.kind === 'audio' ? 'Audio' : 'Wideo'}: ${a.name}, ${a.mediaType}, ${formatBytes(a.size)} — metadane w wiadomości; pełna analiza binariów wymaga modelu multimodal (obraz działa przez image_base64).]`,
      );
    }
  }

  const message =
    [userText.trim(), ...blocks].filter(Boolean).join('\n') ||
    (imageBase64 ? '(załącznik obrazu)' : '');

  return {
    message,
    imageBase64,
    parts: parts.length ? parts : undefined,
  };
}

export function totalAttachmentBytes(attachments: readonly PendingAttachment[]): number {
  return attachments.reduce((sum, a) => sum + a.size, 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export const FILE_ACCEPT =
  'image/*,audio/*,video/*,.csv,.tsv,.txt,.md,.json,text/plain,text/csv,application/csv';
