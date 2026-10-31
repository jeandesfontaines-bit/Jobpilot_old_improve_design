import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getScrapingLogs, getSources, triggerScrape, isSourceRunnable } from '../services/api';
import { ScrapingLog, Source } from '../types';
import { sourceLabel } from '../lib/sources';
import { fmtDateTime } from '../lib/format';
import { RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, ProgressBar, Spinner } from './ui';
import type { BadgeTone } from './ui';

interface ConnectorsViewProps {
  refreshKey?: number;
  onSynchronizeAll?: () => Promise<void>;
  synchronizing?: boolean;
  syncError?: string | null;
  settingsContent?: React.ReactNode;
}
interface Task {
  status?: string;
  uniqueFetched?: number | null;
  totalReported?: number | null;
  message?: string | null;
  error?: string | null;
}
type SourceWithTask = Source & { current_task?: Task | null };
type Level = 'all' | 'info' | 'warning' | 'error';
const LEVELS: Array<{ value: Level; label: string }> = [
  { value: 'all', label: 'Tous' }, { value: 'error', label: 'Erreurs' },
  { value: 'warning', label: 'Alertes' }, { value: 'info', label: 'Infos' },
];
const levelTone = (level: string): BadgeTone => level === 'error' ? 'rose' : level === 'warning' ? 'amber' : 'neutral';
const asLogs = (data: any): ScrapingLog[] => Array.isArray(data) ? data : Array.isArray(data?.logs) ? data.logs : [];
const numeric = (value?: number | null): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const isRunning = (task?: Task | null) => task?.status === 'collecting' || task?.status === 'saving';
const sourceState = (source: SourceWithTask, starting: boolean): { label: string; tone: BadgeTone } => {
  if (starting) return { label: 'Lancement…', tone: 'amber' };
  const status = source.current_task?.status;
  if (status === 'collecting') return { label: 'Collecte', tone: 'amber' };
  if (status === 'saving') return { label: 'Enregistrement', tone: 'amber' };
  if (status === 'queued' || status === 'pending') return { label: 'En attente', tone: 'neutral' };
  if (status === 'error' || source.status === 'erreur') return { label: 'Erreur', tone: 'rose' };
  if (source.status === 'inactif') return { label: 'Inactif', tone: 'neutral' };
  if (source.status === 'partiel') return { label: 'Partiel', tone: 'amber' };
  if (status === 'completed') return { label: 'Terminée', tone: 'emerald' };
  return { label: 'Prêt', tone: 'neutral' };
};

export const ConnectorsView: React.FC<ConnectorsViewProps> = ({ refreshKey = 0, onSynchronizeAll, synchronizing = false, syncError, settingsContent }) => {
  const [sources, setSources] = useState<SourceWithTask[]>([]);
  const [logs, setLogs] = useState<ScrapingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const mounted = useRef(false);
  const requestId = useRef(0);
  const locks = useRef(new Set<string>());
  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [sourceResult, logResult] = await Promise.allSettled([getSources(), getScrapingLogs()]);
    if (!mounted.current || id !== requestId.current) return;
    if (sourceResult.status === 'fulfilled' && Array.isArray(sourceResult.value)) {
      setSources(sourceResult.value); setLoadError(null);
    } else {
      const error = sourceResult.status === 'rejected' ? sourceResult.reason : null;
      setLoadError(error?.response?.data?.error || error?.message || 'Impossible de charger les connecteurs');
    }
    if (logResult.status === 'fulfilled') { setLogs(asLogs(logResult.value)); setLogsError(null); }
    else setLogsError(logResult.reason?.message || 'Impossible de charger le journal');
    setLoading(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    const interval = setInterval(() => { void load(); }, 4000);
    return () => { mounted.current = false; requestId.current += 1; clearInterval(interval); };
  }, [load, refreshKey]);
  const handleTrigger = async (source: SourceWithTask) => {
    if (locks.current.has(source.name) || synchronizing || isRunning(source.current_task) || !isSourceRunnable(source)) return;
    locks.current.add(source.name);
    setStarting(new Set(locks.current));
    setErrors((current) => { const next = { ...current }; delete next[source.name]; return next; });
    try { await triggerScrape(source.name); await load(); }
    catch (error: any) { if (mounted.current) setErrors((current) => ({ ...current, [source.name]: error?.response?.data?.error || error?.message || 'Lancement impossible' })); }
    finally { locks.current.delete(source.name); if (mounted.current) setStarting(new Set(locks.current)); }
  };
  const toggleJournal = (name: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const td = 'px-3 py-3 align-top border-b border-r border-zinc-100';
  const th = 'px-3 py-2 text-left font-medium text-zinc-500 border-b border-r border-zinc-200/80 whitespace-nowrap';
  return <section aria-label="Tableau des connecteurs" className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">
    {loadError && <div className="p-3"><Alert tone="error" action={<Button variant="ghost" size="sm" onClick={() => { void load(); }}>Réessayer</Button>}>{loadError}</Alert></div>}
    {syncError && <div className="p-3"><Alert tone="error">{syncError}</Alert></div>}
    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">Suivi de toutes les sources, actualisé toutes les quatre secondes. Les nombres récupérés concernent la tâche affichée ; les nombres indexés et nouveaux proviennent du dernier état de la source.</caption>
        <thead className="bg-zinc-50/80"><tr>
          <th scope="col" className={th}>Connecteur</th>
          <th scope="col" className={th}>État</th>
          <th scope="col" className={th}>Progression</th>
          <th scope="col" className={th}>Récupérées</th>
          <th scope="col" className={th}>Indexées</th>
          <th scope="col" className={th}>Nouvelles</th>
          <th scope="col" className={th}>Dernière synchro</th>
          <th scope="col" className={th}><div className="flex items-center gap-2">
            <span className="sr-only">Actions</span>
            {onSynchronizeAll && <Button variant="ghost" size="sm" onClick={onSynchronizeAll} disabled={synchronizing || starting.size > 0 || !sources.some(isSourceRunnable)}><RefreshCw className={`h-3.5 w-3.5 ${synchronizing ? 'animate-spin' : ''}`} />{synchronizing ? 'Lancement…' : 'Synchroniser tout'}</Button>}
            {settingsContent && <details className="relative font-normal"><summary className="cursor-pointer list-none rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900">Planification & IA</summary><div className="absolute right-0 top-full z-30 mt-1 w-[min(28rem,calc(100vw-2rem))] max-h-[60vh] overflow-y-auto whitespace-normal rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">{settingsContent}</div></details>}
          </div></th>
        </tr></thead>
        <tbody>
          {loading && !sources.length ? <tr><td colSpan={8} className="p-4"><Spinner label="Chargement des connecteurs..." /></td></tr> : !sources.length ? <tr><td colSpan={8} className="p-4"><EmptyState title="Aucun connecteur disponible" /></td></tr> : sources.map((source, index) => {
            const task = source.current_task;
            const active = isRunning(task);
            const launching = starting.has(source.name);
            const state = sourceState(source, launching);
            const fetched = numeric(task?.uniqueFetched);
            const total = numeric(task?.totalReported);
            const complete = task?.status === 'completed';
            const percent = complete ? 100 : fetched !== null && total !== null && total > 0 ? Math.min(99, Math.round(fetched / total * 100)) : null;
            const error = errors[source.name] || task?.error || source.error_message;
            const open = expanded.has(source.name);
            const level = levels[source.name] || 'all';
            const journal = logs.filter((log) => log.source === source.name && (level === 'all' || log.level === level)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 80);
            const journalId = `connector-journal-${index}`;
            return <React.Fragment key={source.name}>
              <tr className="hover:bg-zinc-50/50">
                <th scope="row" className={`${td} text-left font-medium text-zinc-900 whitespace-nowrap`}>{source.display_name || sourceLabel(source.name)}</th>
                <td className={td}><Badge tone={state.tone}>{state.label}</Badge></td>
                <td className={`${td} min-w-[210px] max-w-xs`}>
                  {(active || complete) && <ProgressBar percent={percent ?? 0} complete={complete} indeterminate={active && percent === null} />}
                  <div className="mt-1 text-xs text-zinc-500">{launching ? 'Démarrage…' : percent !== null ? `${percent} %${fetched !== null && total !== null && total > 0 ? ` · ${fetched} / ${total}` : ''}` : active ? 'Collecte en cours — total inconnu' : '—'}</div>
                  {task?.message && <p className="mt-1 whitespace-normal break-words text-xs leading-5 text-zinc-600">{task.message}</p>}
                  {error && <p role="alert" className="mt-1 whitespace-normal break-words text-xs leading-5 text-rose-700">{error}</p>}
                </td>
                <td className={`${td} text-right tabular-nums`}>{fetched ?? '—'}</td>
                <td className={`${td} text-right tabular-nums`}>{source.found_count ?? '—'}</td>
                <td className={`${td} text-right tabular-nums`}>{source.new_count == null ? '—' : source.new_count > 0 ? `+${source.new_count}` : 0}</td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{fmtDateTime(source.last_run, 'Jamais')}</td>
                <td className={td}><div className="flex items-center gap-1 whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => { void handleTrigger(source); }} disabled={launching || synchronizing || active || !isSourceRunnable(source)}><RefreshCw className={`h-3.5 w-3.5 ${launching ? 'animate-spin' : ''}`} />Synchroniser</Button>
                  <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={journalId} onClick={() => toggleJournal(source.name)}>Journal</Button>
                </div></td>
              </tr>
              {open && <tr><td colSpan={8} className="border-b border-zinc-200 bg-zinc-50/40 p-3"><section id={journalId} aria-label={`Journal ${source.display_name || source.name}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xs font-medium text-zinc-700">Journal — {source.display_name || sourceLabel(source.name)} · 80 derniers messages maximum</h2><label className="flex items-center gap-2 text-xs text-zinc-500">Niveau<select value={level} onChange={(event) => setLevels((current) => ({ ...current, [source.name]: event.target.value as Level }))} className="rounded border border-zinc-200 bg-white px-2 py-1">{LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
                {logsError && <p role="alert" className="mb-2 text-xs text-rose-700">{logsError}</p>}
                {!journal.length ? <p className="text-xs text-zinc-500">Aucun message pour ce filtre.</p> : <div className="max-h-72 overflow-auto"><table className="w-full text-xs"><thead className="sr-only"><tr><th>Date</th><th>Niveau</th><th>Message</th></tr></thead><tbody>{journal.map((log) => <tr key={log.id} className="border-t border-zinc-100"><td className="w-40 whitespace-nowrap py-2 pr-3 align-top text-zinc-400">{fmtDateTime(log.timestamp)}</td><td className="w-24 py-2 pr-3 align-top"><Badge tone={levelTone(log.level)}>{log.level}</Badge></td><td className="py-2 align-top whitespace-pre-wrap break-words font-normal text-zinc-700">{log.message}</td></tr>)}</tbody></table></div>}
              </section></td></tr>}
            </React.Fragment>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
};
