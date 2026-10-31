import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  getApplications,
  updateApplication,
  deleteApplication,
  getPipelineStatus,
  togglePipeline,
  triggerPipelineRun,
  runAiAction,
} from '../services/api';
import { Application, ApplicationStatus, PipelineStatus } from '../types';
import { fmtDate, fmtTime } from '../lib/format';
import {
  Search,
  ExternalLink,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  Copy,
  Check,
  Trash2,
  FileText,
  Building2,
  Calendar,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  Inbox,
  X,
} from 'lucide-react';
import { Spinner, PageHeader, StatusBadge, EmptyState } from './ui';

// Statuts utilisateur simplifiés et cohérents
const PRIMARY_STATUSES: { key: string; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'Envoyée', label: 'Envoyées' },
  { key: 'À vérifier', label: 'À vérifier' },
  { key: 'Refusée', label: 'Refusées' },
];

export const ApplicationsView: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // État du pilote automatique
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [runningCycle, setRunningCycle] = useState(false);
  const [cycleNotice, setCycleNotice] = useState<string | null>(null);

  // Édition de la lettre / notes
  const [coverLetter, setCoverLetter] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copied, setCopied] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Suppression
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [apps, pipe] = await Promise.all([
        getApplications(),
        getPipelineStatus().catch(() => null),
      ]);
      if (Array.isArray(apps)) setApplications(apps);
      if (pipe) setPipelineStatus(pipe);
    } catch (err) {
      console.error('Erreur chargement candidatures :', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Candidature actuellement sélectionnée
  const selectedApp = useMemo(() => {
    return applications.find((a) => a.id === selectedId) || null;
  }, [applications, selectedId]);

  // Synchronisation des champs quand on sélectionne une nouvelle candidature
  useEffect(() => {
    if (selectedApp) {
      setCoverLetter(selectedApp.cover_letter || '');
      setNotes(selectedApp.notes || '');
      setSaveStatus('idle');
      setCopied(false);
      setConfirmDeleteId(null);
    }
  }, [selectedApp?.id]);

  // Filtrage par recherche et par statut
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        !searchQuery.trim() ||
        (app.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.location || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.canton || '').toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (activeTab === 'all') return true;
      if (activeTab === 'Envoyée') return app.status === 'Envoyée' || app.status === 'Simulé';
      if (activeTab === 'À vérifier') return app.status === 'À vérifier' || app.status === 'Intervention nécessaire' || app.status === 'Échec';
      if (activeTab === 'Refusée') return app.status === 'Refusée';
      return app.status === activeTab;
    });
  }, [applications, searchQuery, activeTab]);

  // Sélection automatique de la première candidature si aucune n'est active
  useEffect(() => {
    if (filteredApplications.length > 0) {
      if (!selectedId || !filteredApplications.some((a) => a.id === selectedId)) {
        setSelectedId(filteredApplications[0].id);
      }
    } else {
      setSelectedId(null);
    }
  }, [filteredApplications, selectedId]);

  // Sauvegarde automatique avec délai
  useEffect(() => {
    if (!selectedApp) return;
    if (coverLetter === (selectedApp.cover_letter || '') && notes === (selectedApp.notes || '')) {
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await updateApplication(selectedApp.id, { cover_letter: coverLetter, notes });
        setApplications((prev) =>
          prev.map((a) => (a.id === selectedApp.id ? { ...a, cover_letter: coverLetter, notes } : a))
        );
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2500);
      } catch (err) {
        console.error('Erreur sauvegarde candidature :', err);
        setSaveStatus('idle');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [coverLetter, notes, selectedApp]);

  // Actions
  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    if (!selectedApp) return;
    try {
      const payload: Partial<Application> = { status: newStatus };
      if (newStatus === 'Envoyée') payload.sent_at = new Date().toISOString();
      await updateApplication(selectedApp.id, payload);
      setApplications((prev) =>
        prev.map((a) => (a.id === selectedApp.id ? { ...a, ...payload } : a))
      );
    } catch (err) {
      console.error('Erreur changement de statut :', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteApplication(id);
      setApplications((prev) => prev.filter((a) => a.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error('Erreur suppression :', err);
    }
  };

  const handleTogglePipeline = async () => {
    if (!pipelineStatus) return;
    try {
      const res = await togglePipeline(!pipelineStatus.active);
      setPipelineStatus(res);
    } catch (err) {
      console.error('Erreur toggle pipeline :', err);
    }
  };

  const handleRunCycle = async () => {
    setRunningCycle(true);
    setCycleNotice(null);
    try {
      const res = await triggerPipelineRun();
      const count = res?.report?.submitted_simulated_count || res?.report?.selected_count || 0;
      setCycleNotice(`Cycle test terminé : ${count} candidature(s) traitée(s).`);
      await loadData();
      setTimeout(() => setCycleNotice(null), 5000);
    } catch (err: any) {
      setCycleNotice(`Erreur : ${err.message}`);
    } finally {
      setRunningCycle(false);
    }
  };

  const handleCopyLetter = () => {
    if (!coverLetter) return;
    navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateLetter = async () => {
    if (!selectedApp?.job_id || aiGenerating) return;
    setAiGenerating(true);
    try {
      const res = await runAiAction('draft_letter', selectedApp.job_id);
      if (res.result) {
        setCoverLetter(res.result);
      }
    } catch (err) {
      console.error('Erreur régénération IA :', err);
    } finally {
      setAiGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <Spinner label="Chargement de vos candidatures..." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* ── BARRE D'ACTION SUPÉRIEURE ÉPURÉE ── */}
      <PageHeader
        title="Candidatures"
        counters={
          <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-semibold">
            {applications.length} candidature{applications.length > 1 ? 's' : ''}
          </span>
        }
        actions={
          <div className="flex items-center gap-2.5">
            {cycleNotice && (
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                {cycleNotice}
              </span>
            )}

            <button
              type="button"
              onClick={handleTogglePipeline}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                pipelineStatus?.active
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  pipelineStatus?.active ? 'bg-emerald-600 animate-pulse' : 'bg-zinc-400'
                }`}
              />
              <span>Pilote auto : {pipelineStatus?.active ? 'ACTIF' : 'EN PAUSE'}</span>
              {pipelineStatus?.active ? <Pause className="w-3 h-3 ml-0.5" /> : <Play className="w-3 h-3 ml-0.5 fill-current" />}
            </button>

            <button
              type="button"
              onClick={handleRunCycle}
              disabled={runningCycle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50 transition-colors shadow-2xs"
              title="Lancer un cycle de test immédiat"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${runningCycle ? 'animate-spin' : ''}`} />
              <span>Tester 1 cycle</span>
            </button>
          </div>
        }
      />

      {/* ── CORPS MASTER-DETAIL ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* COLONNE GAUCHE : LISTE */}
        <aside className="w-full sm:w-[380px] md:w-[420px] shrink-0 border-r border-zinc-200/90 flex flex-col bg-white">
          {/* Recherche & Filtres */}
          <div className="p-3 border-b border-zinc-100 space-y-2 bg-zinc-50/50">
            {/* Barre de recherche */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par poste, entreprise, lieu..."
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 text-zinc-900 placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Onglets de statut */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
              {PRIMARY_STATUSES.map((tab) => {
                const count =
                  tab.key === 'all'
                    ? applications.length
                    : tab.key === 'Envoyée'
                    ? applications.filter((a) => a.status === 'Envoyée' || a.status === 'Simulé').length
                    : tab.key === 'À vérifier'
                    ? applications.filter((a) => a.status === 'À vérifier' || a.status === 'Intervention nécessaire').length
                    : applications.filter((a) => a.status === 'Refusée').length;

                const isActive = activeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-zinc-900 text-white font-medium shadow-2xs'
                        : 'text-zinc-600 hover:bg-zinc-200/60'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isActive ? 'bg-zinc-700 text-white' : 'bg-zinc-200/70 text-zinc-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Liste scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
            {filteredApplications.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Aucune candidature trouvée"
                description="Modifie ta recherche ou tes filtres pour afficher tes candidatures."
              />
            ) : (
              filteredApplications.map((app, idx) => {
                const isSelected = app.id === selectedId;
                const dateStr = fmtDate(app.created_at || app.sent_at);

                return (
                  <button
                    key={`${app.id}-${idx}`}
                    type="button"
                    onClick={() => setSelectedId(app.id)}
                    className={`w-full text-left p-3.5 transition-all block relative ${
                      isSelected
                        ? 'bg-zinc-50/90 border-l-3 border-zinc-900'
                        : 'hover:bg-zinc-50/50'
                    }`}
                  >
                    <div className="space-y-1">
                      {/* Titre & Entreprise */}
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-zinc-600 truncate">{app.company || 'Entreprise'}</span>
                        {app.canton && (
                          <span className="shrink-0 text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-zinc-100 text-zinc-700 rounded">
                            {app.canton}
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs font-bold text-zinc-900 truncate leading-snug">
                        {app.title || 'Poste sans intitulé'}
                      </h3>

                      {/* Statut & Date */}
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <StatusBadge status={app.status} />
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* COLONNE DROITE : DÉTAIL CLAIR ET AÉRÉ */}
        <main className="flex-1 overflow-y-auto bg-white p-6 sm:p-10 custom-scrollbar">
          {!selectedApp ? (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div className="space-y-3 max-w-sm">
                <FileText className="w-10 h-10 text-zinc-300 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-800">Sélectionnez une candidature</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Consultez la lettre de motivation transmise, mettez à jour votre statut de suivi ou notez les dates d'entretien.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* En-tête de la candidature */}
              <header className="space-y-3 pb-5 border-b border-zinc-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                      <span className="flex items-center gap-1 text-zinc-700 font-semibold">
                        <Building2 className="w-3.5 h-3.5 text-zinc-400" />
                        {selectedApp.company || 'Entreprise confidentielle'}
                      </span>
                      {selectedApp.location && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                            {selectedApp.location}
                          </span>
                        </>
                      )}
                      {selectedApp.canton && <span>({selectedApp.canton})</span>}
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 break-words leading-tight">
                      {selectedApp.title || 'Candidature'}
                    </h2>
                  </div>

                  {/* Actions rapides d'en-tête */}
                  <div className="flex items-center gap-2">
                    {selectedApp.url && (
                      <a
                        href={selectedApp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Voir l'offre originale</span>
                      </a>
                    )}

                    {confirmDeleteId === selectedApp.id ? (
                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 p-1 rounded-lg">
                        <span className="text-[11px] text-rose-800 font-medium px-1.5">Supprimer ?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedApp.id)}
                          className="px-2 py-0.5 bg-rose-600 text-white text-xs font-bold rounded hover:bg-rose-700"
                        >
                          Oui
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 bg-white text-zinc-700 text-xs font-medium rounded border hover:bg-zinc-100"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selectedApp.id)}
                        className="p-2 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-zinc-100 transition-colors"
                        title="Retirer cette candidature du suivi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Statut & Dates */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 font-medium">Statut :</span>
                    <select
                      value={selectedApp.status}
                      onChange={(e) => handleStatusChange(e.target.value as ApplicationStatus)}
                      className="px-2.5 py-1 bg-white border border-zinc-300 rounded-md text-xs font-semibold text-zinc-800 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="Envoyée">Envoyée</option>
                      <option value="À vérifier">À vérifier / Intervention</option>
                      <option value="Sélectionnée">Sélectionnée</option>
                      <option value="Refusée">Refusée / Sans suite</option>
                    </select>
                  </div>

                  <span className="text-zinc-300">|</span>

                  <span className="text-zinc-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    Créée le {fmtDate(selectedApp.created_at)}
                  </span>

                  {selectedApp.sent_at && (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Envoyée le {fmtDate(selectedApp.sent_at)} à {fmtTime(selectedApp.sent_at)}
                    </span>
                  )}
                </div>
              </header>

              {/* Ligne discrète de preuve / document (si simulation) */}
              {(selectedApp.is_simulated || selectedApp.submission_proof) && (
                <div className="bg-zinc-50 border border-zinc-200/90 rounded-lg p-3 text-xs text-zinc-600 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium text-zinc-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Mode simulation validé</span>
                    {selectedApp.submission_proof?.reference && (
                      <span className="font-mono text-[11px] text-zinc-500">
                        (Réf : {selectedApp.submission_proof.reference})
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-500 text-[11px]">
                    Document associé : <span className="font-mono text-zinc-700">{selectedApp.cv_filename || 'CV par défaut'}</span>
                  </div>
                </div>
              )}

              {/* SECTION 1 : LETTRE DE MOTIVATION (STYLE DOCUMENT) */}
              <section className="space-y-3" aria-label="Lettre de motivation">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-600" />
                    <h3 className="text-sm font-bold text-zinc-900">Lettre de motivation</h3>
                    {saveStatus === 'saving' && <span className="text-xs text-zinc-400 animate-pulse">Enregistrement...</span>}
                    {saveStatus === 'saved' && <span className="text-xs text-emerald-600 font-medium">✓ Enregistré</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRegenerateLetter}
                      disabled={aiGenerating}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>{aiGenerating ? 'Rédaction IA...' : 'Régénérer avec l\'IA'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyLetter}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-100 rounded-md border border-zinc-200 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copié !' : 'Copier'}</span>
                    </button>
                  </div>
                </div>

                {/* Vraie feuille de document */}
                <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-6 shadow-2xs">
                  <textarea
                    rows={12}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Rédigez ou éditez votre lettre de motivation sur-mesure..."
                    className="w-full text-xs sm:text-sm text-zinc-800 leading-relaxed font-sans bg-transparent border-0 focus:outline-none resize-y"
                  />
                </div>
              </section>

              {/* SECTION 2 : NOTES ET SUIVI D'ENTRETIEN */}
              <section className="space-y-2 pt-3 border-t border-zinc-200/80" aria-label="Notes personnelles">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                    Notes personnelles & Suivi d'entretien
                  </h3>
                  {saveStatus === 'saved' && <span className="text-[11px] text-emerald-600 font-medium">Enregistré</span>}
                </div>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes privées : nom du recruteur, date de relance, retour d'entretien..."
                  className="w-full p-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-400"
                />
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
