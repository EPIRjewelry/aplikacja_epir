/**
 * Chat widget – fixed panel in bottom-right corner.
 * Zawsze używa fetch() do chatApiUrl (Remix /api/chat lub Worker).
 * Gdy CHAT_API_URL wskazuje na Worker – czat działa przez Workers AI.
 * TODO: Add canTrack / cookie consent check when integrating analytics.
 */
import {useState, useCallback, useRef, useEffect} from 'react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type ChatResponseBody = {
  reply: string;
  suggestedProducts?: {id: string; title: string}[];
};

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

export type ChatWidgetProps = {
  chatApiUrl: string;
  cartId?: string | null;
  brand?: string;
};

function ChatWidgetFallback({
  chatApiUrl,
  cartId,
  brand = 'epir',
  isOpen,
  onToggle,
}: {
  chatApiUrl: string;
  cartId?: string | null;
  brand?: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      setIsLoading(true);
      setErrorMessage(null);

      const isMcp = chatApiUrl.includes('/apps/assistant/chat');
      const sessionId =
        typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_ID_KEY) : null;

      try {
        const body = isMcp
          ? {
              message: trimmed,
              session_id: sessionId || undefined,
              cart_id: cartId ?? undefined,
              brand,
              stream: true,
            }
          : {
              message: trimmed,
              anonymousId: getOrCreateAnonymousId() || undefined,
              cartId: cartId ?? undefined,
            };

        const res = await fetch(chatApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: isMcp ? 'text/event-stream, application/json' : 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as {error?: string}).error ?? `HTTP ${res.status}`);
        }

        if (isMcp && res.headers.get('content-type')?.includes('text/event-stream')) {
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
    [chatApiUrl, cartId, brand, isLoading],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputValue);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {isOpen && (
        <div className="flex h-80 w-96 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium">
            Czat z asystentem
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">Napisz wiadomość, aby rozpocząć.</p>
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
                {m.text}
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
                type="submit"
                disabled={isLoading || !inputValue.trim()}
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
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ChatWidgetFallback
      chatApiUrl={chatApiUrl}
      cartId={cartId}
      brand={brand}
      isOpen={isOpen}
      onToggle={() => setIsOpen((o) => !o)}
    />
  );
}
