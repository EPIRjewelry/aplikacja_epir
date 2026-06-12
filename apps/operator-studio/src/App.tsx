import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  FILE_ACCEPT,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  buildMessageWithAttachments,
  fileToAttachment,
  formatBytes,
  totalAttachmentBytes,
  type PendingAttachment,
} from './attachments';
import {
  ROLES,
  type ChatMessage,
  type ModelSource,
  type OpenRouterCatalogModel,
  type OperatorRoleId,
  clearSession,
  fetchBlenderHealth,
  fetchOpenRouterModels,
  fetchOperatorProfile,
  fetchReport,
  fetchReports,
  getAdminKey,
  getGroqVariant,
  getModelSource,
  getOrModel,
  getRole,
  saveOperatorProfile,
  setAdminKey,
  setGroqVariant,
  setModelSource,
  setOrModel,
  setRole,
  streamChat,
} from './api';
import { GROQ_MODEL_OPTIONS, isGroqVariantMultimodal, type GroqModelVariantKey } from './groq-models';

type ReportItem = { report_date: string; edog_verdict: string; excerpt: string };
type CatalogStatus = 'idle' | 'loading' | 'ok' | 'error';

export default function App() {
  const [key, setKey] = useState(getAdminKey);
  const [keySaved, setKeySaved] = useState(false);
  const [role, setRoleState] = useState<OperatorRoleId>(getRole);
  const [modelSource, setModelSourceState] = useState<ModelSource>(getModelSource);
  const [groqVariant, setGroqVariantState] = useState<GroqModelVariantKey>(getGroqVariant);
  const [orModel, setOrModelState] = useState(getOrModel);
  const [models, setModels] = useState<OpenRouterCatalogModel[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('idle');
  const [catalogError, setCatalogError] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'reports' | 'blender' | 'profile'>('reports');
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportBody, setReportBody] = useState('');
  const [blenderStatus, setBlenderStatus] = useState('—');
  const [profileNotes, setProfileNotes] = useState('');
  const [profileCampaign, setProfileCampaign] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const hasImageAttachment = attachments.some((a) => a.kind === 'image');

  const catalogHint = useMemo(() => {
    if (catalogStatus === 'loading') return 'Ładuję katalog…';
    if (catalogStatus === 'error') return catalogError || 'Błąd ładowania katalogu';
    if (catalogStatus === 'ok') return `Katalog: ${models.length} modeli (cache ~30 min)`;
    return 'Zapisz klucz, aby załadować katalog';
  }, [catalogStatus, catalogError, models.length]);

  const loadCatalog = useCallback(async () => {
    if (!getAdminKey()) {
      setCatalogStatus('idle');
      setCatalogError('');
      setModels([]);
      return;
    }
    setCatalogStatus('loading');
    setCatalogError('');
    try {
      const j = await fetchOpenRouterModels();
      setModels(j.models);
      setCatalogStatus('ok');
    } catch (e) {
      setModels([]);
      setCatalogStatus('error');
      setCatalogError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadReports = useCallback(async () => {
    if (!getAdminKey()) return;
    try {
      const j = await fetchReports();
      if (j.ok) setReports(j.reports);
    } catch {
      /* ignore */
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!getAdminKey()) return;
    try {
      const j = await fetchOperatorProfile();
      if (j.ok) {
        setProfileNotes(j.profile.brandNotes ?? '');
        setProfileCampaign(j.profile.campaignPriorities ?? '');
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (keySaved && key) {
      void loadCatalog();
      void loadReports();
      void loadProfile();
    }
  }, [keySaved, key, loadCatalog, loadReports, loadProfile]);

  useEffect(() => {
    if (modelSource === 'openrouter' && keySaved && catalogStatus === 'idle') {
      void loadCatalog();
    }
  }, [modelSource, keySaved, catalogStatus, loadCatalog]);

  const saveKey = () => {
    setAdminKey(key);
    setKeySaved(true);
  };

  const onModelSourceChange = (s: ModelSource) => {
    setModelSourceState(s);
    setModelSource(s);
  };

  const onGroqVariantChange = (v: GroqModelVariantKey) => {
    setGroqVariantState(v);
    setGroqVariant(v);
  };

  const onOrModelChange = (value: string) => {
    setOrModelState(value);
    setOrModel(value);
  };

  const onFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const added: PendingAttachment[] = [];
      for (const file of Array.from(files)) {
        added.push(await fileToAttachment(file));
      }
      const nextTotal = totalAttachmentBytes([...attachments, ...added]);
      if (nextTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error(
          `Suma załączników przekracza ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)} (łącznie ${formatBytes(nextTotal)}).`,
        );
      }
      setAttachments((prev) => [...prev, ...added]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [...m, { role: 'error', content: msg }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const openReport = async (date: string) => {
    setSelectedReport(date);
    try {
      const j = await fetchReport(date);
      if (j.ok) setReportBody(j.report.markdown_body);
    } catch {
      setReportBody('Błąd odczytu raportu.');
    }
  };

  const checkBlender = async () => {
    setBlenderStatus('Sprawdzam…');
    try {
      const j = await fetchBlenderHealth();
      if (!j.configured) setBlenderStatus('Nie skonfigurowano BLENDER_BRIDGE_ORIGIN');
      else if (j.online) setBlenderStatus('OK — most odpowiada');
      else setBlenderStatus(`Offline: ${j.detail ?? 'brak odpowiedzi'}`);
    } catch {
      setBlenderStatus('Błąd sprawdzenia');
    }
  };

  const send = async () => {
    const text = input.trim();
    if (busy) return;
    if (!getAdminKey()) return;
    if (!text && attachments.length === 0) return;

    if (modelSource === 'openrouter') {
      const slug = orModel.trim();
      if (!slug) {
        setMessages((m) => [
          ...m,
          { role: 'error', content: 'Wybierz model z katalogu OpenRouter lub przełącz na Groq / Workers AI.' },
        ]);
        return;
      }
      if (slug && catalogStatus === 'ok' && !modelById.has(slug)) {
        setMessages((m) => [
          ...m,
          { role: 'error', content: `Nieznany model OpenRouter: „${slug}”. Wybierz slug z katalogu.` },
        ]);
        return;
      }
      if (slug && catalogStatus !== 'ok') {
        setMessages((m) => [
          ...m,
          { role: 'error', content: 'Katalog OpenRouter nie jest załadowany — odśwież katalog.' },
        ]);
        return;
      }
      if (hasImageAttachment && slug) {
        const m = modelById.get(slug);
        if (m && !m.multimodal && !m.imageGen) {
          setMessages((m) => [
            ...m,
            { role: 'error', content: 'Ten model OpenRouter nie obsługuje obrazu wejściowego — wybierz multimodal.' },
          ]);
          return;
        }
      }
    }

    if (modelSource === 'groq' && hasImageAttachment && !isGroqVariantMultimodal(groqVariant)) {
      setMessages((m) => [
        ...m,
        {
          role: 'error',
          content:
            'Załącznik obrazu wymaga modelu multimodal (kimi_k25, k26, gemma4_26b) lub przełącz na OpenRouter z modelem vision.',
        },
      ]);
      return;
    }

    const built = buildMessageWithAttachments(text, attachments);
    const displayUser =
      text ||
      attachments.map((a) => `[${a.kind}: ${a.name}]`).join(' ') ||
      built.message;

    setInput('');
    setAttachments([]);
    setMessages((m) => [...m, { role: 'user', content: displayUser }]);
    setBusy(true);
    let assistant = '';
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);
    try {
      await streamChat(
        built,
        { role, modelSource, orModel: orModel.trim(), groqVariant },
        (delta) => {
          assistant = delta;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: 'assistant', content: assistant };
            return copy;
          });
        },
        (urls) => {
          if (!urls.length) return;
          const block = urls.map((u) => `![wygenerowany obraz](${u})`).join('\n\n');
          assistant = assistant ? `${assistant}\n\n${block}` : block;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: 'assistant', content: assistant };
            return copy;
          });
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'error', content: msg };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const slug = orModel.trim();
  const selectedOrModel = slug ? modelById.get(slug) : undefined;

  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr_300px] grid-rows-[auto_1fr_auto]">
      <header className="col-span-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <h1 className="text-lg font-semibold">EPIR — Operator Studio (Project B)</h1>
        <p className="text-sm text-slate-400">Groq / Workers AI lub OpenRouter · załączniki · raporty · Blender</p>
      </header>

      <aside className="row-span-2 border-r border-slate-800 bg-slate-900 p-4">
        <label className="text-xs text-slate-400">EPIR_OPERATOR_PANEL_SECRET</label>
        <input
          type="password"
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium"
          onClick={saveKey}
        >
          Zapisz klucz
        </button>
        <button
          type="button"
          className="mt-2 w-full rounded border border-slate-700 px-3 py-1 text-sm"
          onClick={() => {
            clearSession();
            setMessages([]);
            setAttachments([]);
          }}
        >
          Nowa rozmowa
        </button>

        <div className="mt-4">
          <label className="text-xs text-slate-400">Rola</label>
          <select
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
            value={role}
            onChange={(e) => {
              const r = e.target.value as OperatorRoleId;
              setRoleState(r);
              setRole(r);
            }}
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{ROLES.find((r) => r.id === role)?.hint}</p>
        </div>

        <div className="mt-4">
          <label className="text-xs text-slate-400">Źródło modelu</label>
          <select
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
            value={modelSource}
            onChange={(e) => onModelSourceChange(e.target.value as ModelSource)}
          >
            <option value="groq">Groq / Workers AI</option>
            <option value="openrouter">Katalog OpenRouter</option>
          </select>
        </div>

        {modelSource === 'groq' ? (
          <div className="mt-3">
            <label className="text-xs text-slate-400" htmlFor="groq-model">
              Model (preset)
            </label>
            <select
              id="groq-model"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              value={groqVariant}
              onChange={(e) => onGroqVariantChange(e.target.value as GroqModelVariantKey)}
            >
              {GROQ_MODEL_OPTIONS.map((o) => (
                <option key={o.key || 'default'} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Nagłówek <code className="text-slate-400">X-Epir-Model-Variant</code>
              {groqVariant ? ` = ${groqVariant}` : ' (domyślny Groq)'}
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <label className="text-xs text-slate-400" htmlFor="or-model-input">
              Model (OpenRouter)
            </label>
            <input
              id="or-model-input"
              type="text"
              list="or-catalog"
              autoComplete="off"
              spellCheck={false}
              placeholder="np. anthropic/claude-sonnet-4"
              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              value={orModel}
              onChange={(e) => onOrModelChange(e.target.value)}
            />
            <datalist id="or-catalog">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.imageGen ? ' 🖼' : ''}
                </option>
              ))}
            </datalist>
            <p
              className={`mt-1 text-xs ${catalogStatus === 'error' ? 'text-red-400' : 'text-slate-500'}`}
            >
              {catalogHint}
            </p>
            {selectedOrModel && (
              <p className="mt-1 text-xs text-slate-500">
                Wybrany: {selectedOrModel.name}
                {selectedOrModel.imageGen ? ' (generacja obrazu)' : ''}
                {selectedOrModel.multimodal ? ' · multimodal' : ''}
              </p>
            )}
            <button
              type="button"
              className="mt-2 w-full rounded border border-slate-700 px-3 py-1 text-xs"
              disabled={catalogStatus === 'loading' || !keySaved}
              onClick={() => void loadCatalog()}
            >
              Odśwież katalog
            </button>
          </div>
        )}
      </aside>

      <main className="flex min-h-0 flex-col p-4">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">Wybierz rolę i model. Załączniki: obraz, audio, wideo, CSV (max 4 MB).</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-sky-900/60'
                  : m.role === 'error'
                    ? 'bg-red-950 text-red-200'
                    : 'bg-slate-800'
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
      </main>

      <aside className="row-span-2 border-l border-slate-800 bg-slate-900 p-3 text-sm">
        <div className="flex gap-2 border-b border-slate-800 pb-2">
          {(['reports', 'blender', 'profile'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`rounded px-2 py-1 text-xs ${tab === t ? 'bg-slate-700' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'reports' ? 'Raporty' : t === 'blender' ? 'Blender' : 'Profil'}
            </button>
          ))}
        </div>

        {tab === 'reports' && (
          <div className="mt-2 space-y-2">
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {reports.map((r) => (
                <li key={r.report_date}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left hover:bg-slate-800 ${selectedReport === r.report_date ? 'bg-slate-800' : ''}`}
                    onClick={() => void openReport(r.report_date)}
                  >
                    <span className="font-medium">{r.report_date}</span>
                    <span className="ml-2 text-slate-500">{r.edog_verdict}</span>
                  </button>
                </li>
              ))}
            </ul>
            {reportBody && (
              <div className="prose prose-invert max-h-64 overflow-y-auto rounded border border-slate-800 p-2 text-xs prose-p:my-1">
                <ReactMarkdown>{reportBody}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {tab === 'blender' && (
          <div className="mt-2 space-y-2 text-xs text-slate-400">
            <p>{blenderStatus}</p>
            <button type="button" className="rounded border border-slate-700 px-2 py-1" onClick={() => void checkBlender()}>
              Sprawdź most
            </button>
          </div>
        )}

        {tab === 'profile' && (
          <div className="mt-2 space-y-2">
            <textarea
              className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs"
              rows={4}
              value={profileNotes}
              onChange={(e) => setProfileNotes(e.target.value)}
              placeholder="Notatki o marce…"
            />
            <textarea
              className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs"
              rows={2}
              value={profileCampaign}
              onChange={(e) => setProfileCampaign(e.target.value)}
              placeholder="Priorytety kampanii…"
            />
            <button
              type="button"
              className="rounded border border-slate-700 px-2 py-1 text-xs"
              onClick={() =>
                void saveOperatorProfile({ brandNotes: profileNotes, campaignPriorities: profileCampaign })
              }
            >
              Zapisz profil (D1)
            </button>
          </div>
        )}
      </aside>

      <footer className="col-span-3 border-t border-slate-800 bg-slate-900 p-4">
        {attachments.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs"
              >
                {a.kind === 'image' && a.previewUrl && (
                  <img src={a.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
                )}
                <span>
                  {a.name} ({formatBytes(a.size)})
                </span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => removeAttachment(a.id)}
                  aria-label={`Usuń ${a.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          rows={2}
          placeholder="Wiadomość… Enter wyślij, Shift+Enter nowa linia"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="max-w-[12rem] text-xs"
              onChange={(e) => void onFilesSelected(e.target.files)}
            />
            Załącznik
          </label>
          <span className="text-xs text-slate-500">max {formatBytes(MAX_ATTACHMENT_BYTES)} / plik</span>
          <button
            type="button"
            disabled={busy}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void send()}
          >
            {busy ? 'Wysyłam…' : 'Wyślij'}
          </button>
        </div>
      </footer>
    </div>
  );
}
