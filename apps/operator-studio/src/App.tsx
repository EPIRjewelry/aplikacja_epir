import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ROLES,
  type ChatMessage,
  type OperatorRoleId,
  clearSession,
  fetchBlenderHealth,
  fetchOpenRouterModels,
  fetchOperatorProfile,
  fetchReport,
  fetchReports,
  getAdminKey,
  getOrModel,
  getRole,
  saveOperatorProfile,
  setAdminKey,
  setOrModel,
  setRole,
  streamChat,
} from './api';

type ReportItem = { report_date: string; edog_verdict: string; excerpt: string };

export default function App() {
  const [key, setKey] = useState(getAdminKey);
  const [keySaved, setKeySaved] = useState(false);
  const [role, setRoleState] = useState<OperatorRoleId>(getRole);
  const [orModel, setOrModelState] = useState(getOrModel);
  const [modelFilter, setModelFilter] = useState('');
  const [models, setModels] = useState<{ id: string; name: string; imageGen: boolean }[]>([]);
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

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return models.slice(0, 80);
    return models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 80);
  }, [models, modelFilter]);

  const loadCatalog = useCallback(async () => {
    if (!getAdminKey()) return;
    try {
      const j = await fetchOpenRouterModels();
      if (j.ok) setModels(j.models);
    } catch {
      /* ignore */
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

  const saveKey = () => {
    setAdminKey(key);
    setKeySaved(true);
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
    if (!text || busy) return;
    if (!getAdminKey()) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    let assistant = '';
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);
    try {
      await streamChat(
        text,
        { role, orModel },
        (delta) => {
          assistant = delta;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: 'assistant', content: assistant };
            return copy;
          });
        },
        () => {},
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

  return (
    <div className="grid min-h-screen grid-cols-[280px_1fr_300px] grid-rows-[auto_1fr_auto]">
      <header className="col-span-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <h1 className="text-lg font-semibold">EPIR — Operator Studio (Project B)</h1>
        <p className="text-sm text-slate-400">Twoi agenci wewnętrzni — bez Gemmy. OpenRouter + raporty + Blender.</p>
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
          <label className="text-xs text-slate-400">Model (OpenRouter)</label>
          <input
            type="search"
            placeholder="Szukaj modelu…"
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          />
          <select
            className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
            value={orModel}
            onChange={(e) => {
              setOrModelState(e.target.value);
              setOrModel(e.target.value);
            }}
          >
            <option value="">default (Groq)</option>
            {filteredModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} {m.imageGen ? '🖼' : ''}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col p-4">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">Wybierz rolę i zadaj pytanie. Raporty dzienne po prawej.</p>
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
        <button
          type="button"
          disabled={busy}
          className="mt-2 rounded bg-sky-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => void send()}
        >
          {busy ? 'Wysyłam…' : 'Wyślij'}
        </button>
      </footer>
    </div>
  );
}
