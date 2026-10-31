import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getSettings, updateSettings, testOllamaConnection, getSources, triggerScrape, isSourceRunnable, getPipelineStatus, triggerPipelineRun } from '../services/api';
import { Settings, PipelineStatus } from '../types';
import { RefreshCw } from 'lucide-react';
import { Alert, Button, Field, Input, Spinner } from './ui';
import { SaveFeedback } from './ui/SaveFeedback';
import { ConnectorsView } from './ConnectorsView';
import { useAutosave } from '../hooks/useAutosave';

interface SettingsViewProps { refreshKey?: number; onRefreshed?: () => void; }

export const SettingsView: React.FC<SettingsViewProps> = ({ refreshKey = 0, onRefreshed }) => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testingOllama, setTestingOllama] = useState(false);
  const [ollamaResult, setOllamaResult] = useState<{ success: boolean; message: string } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [synchronizing, setSynchronizing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleFeedback, setCycleFeedback] = useState<string | null>(null);
  const syncLock = useRef(false);
  const autosave = useAutosave(settings, updateSettings);

  const loadPipelineStatus = useCallback(async () => {
    try {
      const st = await getPipelineStatus();
      setPipelineStatus(st);
    } catch (e) {}
  }, []);

  const loadSettings = () => {
    setLoading(true); setLoadError(null);
    getSettings().then(setSettings).catch((error) => setLoadError(error?.response?.data?.error || error?.message || 'Erreur de chargement')).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
    loadPipelineStatus();
    const interval = setInterval(loadPipelineStatus, 5000);
    return () => clearInterval(interval);
  }, [loadPipelineStatus]);

  const handleRunCycleNow = async () => {
    setRunningCycle(true);
    setCycleFeedback(null);
    try {
      const res = await triggerPipelineRun();
      setCycleFeedback(`Cycle terminé : ${res?.report?.selected_count || 0} sélectionnée(s), ${res?.report?.submitted_simulated_count || 0} simulée(s).`);
      void loadPipelineStatus();
    } catch (e: any) {
      setCycleFeedback(`Erreur : ${e?.response?.data?.error || e.message}`);
    } finally {
      setRunningCycle(false);
    }
  };
  const handleTestOllama = async () => {
    if (!settings) return;
    setTestingOllama(true); setOllamaResult(null);
    try {
      const result = await testOllamaConnection(settings.ollama_url, settings.ollama_model);
      const names: string[] = (result.models || []).map((model: any) => model.name || model);
      setAvailableModels(names);
      setOllamaResult({ success: true, message: names.length ? `Connecté ! Modèles disponibles : ${names.join(', ')}` : 'Connecté ! Prêt à l’emploi' });
    } catch (error: any) { setOllamaResult({ success: false, message: error?.response?.data?.error || error?.message || 'Impossible de joindre le serveur Ollama' }); }
    finally { setTestingOllama(false); }
  };
  const synchronizeAll = async () => {
    if (syncLock.current) return;
    syncLock.current = true; setSynchronizing(true); setSyncError(null);
    try {
      const sources = await getSources();
      const failures: string[] = [];
      for (const source of sources.filter(isSourceRunnable)) {
        try { await triggerScrape(source.name); }
        catch (error: any) { failures.push(`${source.display_name || source.name} : ${error?.response?.data?.error || error?.message || 'lancement impossible'}`); }
      }
      if (failures.length) setSyncError(failures.join(' ; '));
    } catch (error: any) { setSyncError(error?.response?.data?.error || error?.message || 'Synchronisation impossible'); }
    finally { setLocalRefreshKey((key) => key + 1); onRefreshed?.(); setSynchronizing(false); syncLock.current = false; }
  };
  const settingsContent = <div className="space-y-4">
    <div className="space-y-3 pb-3 border-b border-zinc-100">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Planificateur autonome</h2>
        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold">Simulation exclusive</span>
      </div>
      {settings && (
        <>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={settings.scheduler_active !== false}
              onChange={(event) => setSettings({ ...settings, scheduler_active: event.target.checked })}
              className="h-4 w-4 accent-zinc-900"
            />
            Collecte et qualification en continu
          </label>
          <Field label="Intervalle entre chaque cycle (minutes)">
            <Input
              type="number"
              min={1}
              max={120}
              value={settings.interval_minutes || settings.auto_scrape_interval || 15}
              onChange={(event) => {
                const val = Math.max(1, parseInt(event.target.value) || 1);
                setSettings({ ...settings, interval_minutes: val, auto_scrape_interval: val });
              }}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Limite par cycle (candidatures max)">
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.max_candidates_per_cycle || 2}
                onChange={(event) => setSettings({ ...settings, max_candidates_per_cycle: Math.max(1, parseInt(event.target.value) || 2) })}
              />
            </Field>
            <Field label="Quota quotidien (jour civil Europe/Zurich)">
              <Input
                type="number"
                min={1}
                max={50}
                value={settings.daily_submission_quota || settings.daily_application_limit || 5}
                onChange={(event) => {
                  const val = Math.max(1, parseInt(event.target.value) || 5);
                  setSettings({ ...settings, daily_submission_quota: val, daily_application_limit: val });
                }}
              />
            </Field>
          </div>
          <div className="rounded-md bg-zinc-50 border border-zinc-200/80 p-2.5 text-xs text-zinc-600 space-y-1">
            <div className="flex items-center justify-between font-medium text-zinc-800">
              <span>Jour civil en cours (Europe/Zurich)</span>
              <span className="font-mono text-zinc-900">{pipelineStatus?.zurich_today_date || new Date().toISOString().slice(0, 10)}</span>
            </div>
            <p>
              Aujourd'hui (Zurich) : <strong>{pipelineStatus?.daily_submissions_count || 0}</strong> / {settings.daily_submission_quota || settings.daily_application_limit || 5} candidatures simulées.
            </p>
            <p className="text-[11px] text-zinc-500">
              Remise à zéro automatique à minuit heure suisse. Aucun envoi réel n'est effectué dans cette phase.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRunCycleNow}
            disabled={runningCycle}
            className="w-full text-xs font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runningCycle ? 'animate-spin' : ''}`} />
            {runningCycle ? 'Simulation en cours…' : 'Exécuter un cycle de simulation maintenant'}
          </Button>
          {cycleFeedback && (
            <Alert tone={cycleFeedback.includes('Erreur') ? 'error' : 'success'}>
              {cycleFeedback}
            </Alert>
          )}
        </>
      )}
    </div>

    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-900">IA locale — Ollama</h2>
      {loading ? <Spinner label="Chargement des réglages..." /> : loadError || !settings ? <Alert tone="error" action={<Button variant="ghost" size="sm" onClick={loadSettings}>Réessayer</Button>}>{loadError || 'Réponse vide du serveur'}</Alert> : <>
        <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={settings.ollama_enabled} onChange={(event) => setSettings({ ...settings, ollama_enabled: event.target.checked })} className="h-4 w-4 accent-zinc-900" />Activer Ollama</label>
        <Field label="URL du serveur Ollama"><Input type="text" value={settings.ollama_url || ''} onChange={(event) => setSettings({ ...settings, ollama_url: event.target.value })} placeholder="http://localhost:11434" /></Field>
        <Field label="Modèle Ollama"><Input type="text" list="ollama-models" value={settings.ollama_model || ''} onChange={(event) => setSettings({ ...settings, ollama_model: event.target.value })} placeholder="llama3" /><datalist id="ollama-models">{availableModels.map((model) => <option key={model} value={model} />)}</datalist></Field>
        <p className="text-xs leading-5 text-zinc-500">Génération par LLM local si disponible, avec secours déterministe automatique.</p>
        <Button size="sm" onClick={handleTestOllama} disabled={testingOllama}><RefreshCw className={`h-4 w-4 ${testingOllama ? 'animate-spin' : ''}`} />Tester la connexion</Button>
        {ollamaResult && <Alert tone={ollamaResult.success ? 'success' : 'error'}>{ollamaResult.message}</Alert>}
        <SaveFeedback status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} onRetry={autosave.retry} />
      </>}
    </div>
  </div>;
  return <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white">
    <ConnectorsView refreshKey={refreshKey + localRefreshKey} onSynchronizeAll={synchronizeAll} synchronizing={synchronizing} syncError={syncError} settingsContent={settingsContent} />
    {autosave.status === 'error' && <div className="shrink-0 px-4 py-1"><SaveFeedback status="error" error={autosave.error} onRetry={autosave.retry} /></div>}
  </div>;
};
