/**
 * Chat widget – fixed panel in bottom-right corner.
 * Zawsze używa fetch() do chatApiUrl (Remix /api/chat lub Worker).
 * Gdy CHAT_API_URL wskazuje na Worker – czat działa przez Workers AI (Kimi K2.5 multimodal).
 * TODO: Add canTrack / cookie consent check when integrating analytics.
 */
import {useState, useCallback, useRef, useEffect} from 'react';
import {DEFAULT_PERSONA_UI, type PersonaUi} from './persona-ui';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
};

type ChatResponseBody = {
  reply: string;
  suggestedProducts?: {id: string; title: string}[];
};

/** Fragmenty zgodne z workers-ai-provider / worker (parse `parts` po stronie serwera). */
export type ChatRequestPart =
  | {type: 'text'; text: string}
  | {type: 'file'; data: string; mediaType: string};

const ANONYMOUS_ID_KEY = 'chat-anonymous-id';

export function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(ANONYMOUS_ID_KEY);
  if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) {
    id = crypto.randomUUID();
    sessionStorage.setItem(ANONYMOUS_ID_KEY, id);
  }
  return id ?? '';
}

const SESSION_ID_KEY = 'epir-assistant-session';

function createFileReadError(details?: string): Error {
  const baseMessage = 'Nie udało się odczytać załączonego pliku. Spróbuj ponownie.';
  return new Error(details ? `${baseMessage} Szczegóły: ${details}` : baseMessage);
}

function readFileAsBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') {
        reject(createFileReadError());
        return;
      }
      const i = r.indexOf(',');
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => reject(createFileReadError(reader.error?.message));
    reader.readAsDataURL(file);
  });
}

export type ChatWidgetProps = {
  chatApiUrl: string;
  cartId?: string | null;
  brand?: string;
  /** Z loadera — teksty persony do wyświetlenia (bez promptu systemowego). */
  personaUi?: PersonaUi;
  /** Z loadera kanału headless — zawsze w body POST (worker / analytics). */
  storefrontId: string;
  /** Z loadera kanału headless — zawsze w body POST. */
  channel: string;
  route?: string;
};

function ChatWidgetFallback({
  chatApiUrl,
  cartId,
  brand = 'epir',
  personaUi,
  storefrontId,
  channel,
  route,
  isOpen,
  onToggle,
}: {
  chatApiUrl: string;
  cartId?: string | null;
  brand?: string;
  personaUi: PersonaUi;
  storefrontId: string;
  channel: string;
  route?: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [pendingImage, setPendingImage] = useState<{file: File; previewUrl: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageImageUrlsRef = useRef<Set<string>>(new Set());

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (pendingImage?.previewUrl && !messageImageUrlsRef.current.has(pendingImage.previewUrl)) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    };
  }, [pendingImage?.previewUrl]);

  useEffect(() => {
    return () => {
      messageImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      messageImageUrlsRef.current.clear();
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const attachment = pendingImage;
      if ((!trimmed && !attachment) || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed || (attachment ? 'Załączono zdjęcie' : ''),
        ...(attachment?.previewUrl ? {imagePreviewUrl: attachment.previewUrl} : {}),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      if (attachment?.previewUrl) {
        messageImageUrlsRef.current.add(attachment.previewUrl);
      }
      setPendingImage(null);
      setIsLoading(true);
      setErrorMessage(null);

      const sessionId =
        typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_ID_KEY) : null;

      try {
        const parts: ChatRequestPart[] = [];
        if (trimmed) parts.push({type: 'text', text: trimmed});
        if (attachment) {
          const data = await readFileAsBase64Data(attachment.file);
          parts.push({
            type: 'file',
            data,
            mediaType: attachment.file.type || 'image/jpeg',
          });
        }

        const body: Record<string, unknown> = {
          storefrontId: storefrontId ?? '',
          channel: channel ?? '',
          message: trimmed || (attachment ? '' : ''),
          session_id: sessionId || undefined,
          cart_id: cartId ?? undefined,
          brand,
          stream: true,
          ...(route ? {route} : {}),
        };
        if (parts.length > 0) {
          body.parts = parts;
        }

        const res = await fetch(chatApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as {error?: string}).error ?? `HTTP ${res.status}`);
        }

        if (res.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = res.body?.getReader();
          if (!reader) throw new Error('No response body');
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';
          const msgId = `assistant-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {id: msgId, role: 'assistant', text: '...'},
          ]);
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const chunk = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const dataLines = chunk.split(/\r?\n/).filter((l) => l.startsWith('data:'));
              for (const line of dataLines) {
                const jsonStr = line.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.session_id) {
                    sessionStorage.setItem(SESSION_ID_KEY, parsed.session_id);
                  }
                  if (parsed.error) throw new Error(parsed.error);
                  if (parsed.delta) accumulated += parsed.delta;
                  if (parsed.content) accumulated = parsed.content;
                  if (parsed.done) break;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msgId ? {...m, text: accumulated || '...'} : m,
                    ),
                  );
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  if (e instanceof Error) throw e;
                }
              }
            }
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? {...m, text: accumulated || '(brak odpowiedzi)'} : m,
            ),
          );
        } else {
          const data = (await res.json().catch(() => ({}))) as ChatResponseBody & {
            error?: string;
          };
          if (!data.reply) throw new Error('No reply from server');
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: data.reply,
          };
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Wystąpił błąd';
        setErrorMessage(msg);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [chatApiUrl, cartId, brand, storefrontId, channel, route, isLoading, pendingImage],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(inputValue);
  };

  const canSend = (inputValue.trim().length > 0 || !!pendingImage) && !isLoading;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="flex h-80 w-96 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium">
            {personaUi.chatTitle}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">
                {personaUi.emptyState ?? DEFAULT_PERSONA_UI.emptyState}
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-8 bg-blue-100 text-blue-900'
                    : 'mr-8 bg-gray-100 text-gray-900'
                }`}
              >
                {m.imagePreviewUrl ? (
                  <div className="space-y-2">
                    <img
                      src={m.imagePreviewUrl}
                      alt="Załączone zdjęcie użytkownika"
                      className="max-h-44 w-full rounded border border-blue-200 object-cover"
                    />
                    {m.text ? <p className="m-0 whitespace-pre-wrap">{m.text}</p> : null}
                  </div>
                ) : (
                  m.text
                )}
              </div>
            ))}
            {isLoading && (
              <div className="mr-8 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                Piszę…
              </div>
            )}
            {errorMessage && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2">
            {pendingImage && (
              <div className="mb-2 flex items-center gap-2">
                <img
                  src={pendingImage.previewUrl}
                  alt=""
                  className="h-14 w-14 rounded border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(pendingImage.previewUrl);
                    setPendingImage(null);
                  }}
                  className="text-xs text-gray-600 underline"
                >
                  Usuń zdjęcie
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || !file.type.startsWith('image/')) return;
                setPendingImage((prev) => {
                  if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
                  return {file, previewUrl: URL.createObjectURL(file)};
                });
              }}
            />
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Napisz wiadomość…"
                disabled={isLoading}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              />
              <button
                type="button"
                disabled={isLoading}
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                aria-label="Dodaj zdjęcie"
              >
                📎
              </button>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Wyślij
              </button>
            </div>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
      >
        {isOpen ? 'Zamknij czat' : 'Otwórz czat'}
      </button>
    </div>
  );
}

export function ChatWidget({
  chatApiUrl,
  cartId,
  brand = 'epir',
  personaUi: personaUiProp,
  storefrontId,
  channel,
  route,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const personaUi = {...DEFAULT_PERSONA_UI, ...personaUiProp};

  return (
    <ChatWidgetFallback
      chatApiUrl={chatApiUrl}
      cartId={cartId}
      brand={brand}
      personaUi={personaUi}
      storefrontId={storefrontId}
      channel={channel}
      route={route}
      isOpen={isOpen}
      onToggle={() => setIsOpen((o) => !o)}
    />
  );
}
