import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  FileText,
  Upload,
  Download,
  ExternalLink,
  Trash2,
  CheckCircle2,
  Sparkles,
  Star,
  RefreshCw,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { Spinner, PageHeader, EmptyState } from './ui';
import { regenerateProfilePdf } from '../services/api';

export interface CvItem {
  id: string;
  name: string;
  filename: string;
  isBase: boolean;
  isAdapted: boolean;
  createdAt: string;
  bytes: number;
}

export const CvLibraryView: React.FC = () => {
  const [items, setItems] = useState<CvItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  const loadCvs = async () => {
    try {
      const res = await axios.get('/api/cvs');
      if (Array.isArray(res.data)) {
        setItems(res.data);
        if (!selectedId || !res.data.some(c => c.id === selectedId)) {
          const base = res.data.find(c => c.isBase);
          setSelectedId(base ? base.id : res.data[0]?.id || null);
        }
      }
    } catch (err: any) {
      setFeedback({ tone: 'error', message: err.response?.data?.error || 'Erreur lors du chargement des CVs.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCvs();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setUploading(true);
    setFeedback(null);

    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          throw new Error('Seuls les fichiers PDF sont acceptés.');
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(file);
        });

        await axios.post('/api/cvs', {
          name: file.name.replace(/\.pdf$/i, ''),
          base64_content: base64,
        });
      }
      setFeedback({ tone: 'success', message: 'Fichier(s) CV importé(s) avec succès dans votre bibliothèque.' });
      await loadCvs();
    } catch (err: any) {
      setFeedback({ tone: 'error', message: err.response?.data?.error || err.message || 'Erreur lors de l\'import.' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleGenerateFromProfile = async () => {
    const baseCv = items.find((c) => c.isBase);
    const target = baseCv ? `le CV de base « ${baseCv.filename} »` : 'le CV actif';
    if (!window.confirm(`Générer un PDF à partir des informations de ton profil ? Cette action met à jour ${target}.`)) return;
    setGenerating(true);
    setFeedback(null);
    try {
      const res = await regenerateProfilePdf();
      if (res.success) {
        setFeedback({ tone: 'success', message: `Un CV a été généré à partir de ton profil : « ${res.filename} ».` });
        await loadCvs();
      }
    } catch (err: any) {
      setFeedback({ tone: 'error', message: err.response?.data?.error || err.message || 'Erreur lors de la génération du CV.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleSetBase = async (id: string) => {
    try {
      await axios.post(`/api/cvs/${encodeURIComponent(id)}/set-base`);
      setFeedback({ tone: 'success', message: `Le CV « ${id} » a été défini comme CV de base pour vos candidatures IA.` });
      await loadCvs();
    } catch (err: any) {
      setFeedback({ tone: 'error', message: err.response?.data?.error || 'Erreur lors de la configuration du CV de base.' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Supprimer définitivement le fichier « ${id}.pdf » de la bibliothèque ?`)) return;
    try {
      await axios.delete(`/api/cvs/${encodeURIComponent(id)}`);
      setFeedback({ tone: 'success', message: `Fichier « ${id} » supprimé.` });
      if (selectedId === id) setSelectedId(null);
      await loadCvs();
    } catch (err: any) {
      setFeedback({ tone: 'error', message: err.response?.data?.error || 'Erreur lors de la suppression.' });
    }
  };

  const selectedCv = items.find(c => c.id === selectedId) || null;
  const fileUrl = selectedCv ? `/api/cvs/${encodeURIComponent(selectedCv.id)}/file` : null;

  const baseCvs = items.filter(c => !c.isAdapted);
  const adaptedCvs = items.filter(c => c.isAdapted);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white">
      {/* ── EN-TÊTE DE LA BIBLIOTHÈQUE ── */}
      <PageHeader
        title="Mes CV"
        icon={FileText}
        counters={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-100 text-zinc-600 px-2.5 py-0.5 text-xs font-semibold">
              {items.length} document{items.length > 1 ? 's' : ''}
            </span>
            {selectedCv?.isBase && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                CV de base actif
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateFromProfile}
              disabled={generating || uploading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-semibold transition-all disabled:opacity-50"
              title="Génère un PDF à partir des informations de ton profil"
            >
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-500" /> : <Sparkles className="w-3.5 h-3.5 text-purple-500" />}
              <span>{generating ? 'Génération…' : 'Générer un CV depuis mon profil'}</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer">
              {uploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploading ? 'Importation…' : 'Importer des PDF'}</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                disabled={uploading}
                onChange={handleUpload}
                className="hidden"
              />
            </label>
          </div>
        }
      />

      {/* Bannière de feedback */}
      {feedback && (
        <div className={`shrink-0 px-4 py-2 border-b text-xs flex items-center justify-between ${
          feedback.tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.tone === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-zinc-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* ── CORPS DE LA VUE : MASTER / DETAIL ── */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* Colonne gauche : liste des CVs */}
        <div className="w-full md:w-80 lg:w-96 shrink-0 border-r border-zinc-200/90 flex flex-col bg-zinc-50/50 min-h-0">
          <div className="p-3 border-b border-zinc-200/80 bg-zinc-100/50">
            <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Versions disponibles</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-200/60 custom-scrollbar p-2 space-y-1">
            {loading ? (
              <div className="py-12 flex justify-center">
                <Spinner label="Chargement des documents..." />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Aucun CV dans la bibliothèque"
                description="Importe ton premier fichier PDF pour démarrer."
              />
            ) : (
              <>
                {/* CVs de base */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2">CV Master</span>
                  {baseCvs.map((cv, idx) => {
                    const isSelected = cv.id === selectedId;
                    return (
                      <div
                        key={`${cv.id}-${idx}`}
                        onClick={() => setSelectedId(cv.id)}
                        className={`group relative p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white border-zinc-900 shadow-2xs'
                            : 'bg-white/80 border-zinc-200 hover:border-zinc-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className={`w-4 h-4 shrink-0 ${cv.isBase ? 'text-emerald-600' : 'text-zinc-400'}`} />
                            <span className="text-xs font-bold text-zinc-900 truncate">{cv.name}</span>
                          </div>

                          {cv.isBase && (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded-full">
                              Base
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 text-[10px] text-zinc-400">
                          <span>{Math.ceil(cv.bytes / 1024)} Ko</span>
                          <span>{new Date(cv.createdAt).toLocaleDateString('fr-CH')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Variantes adaptées */}
                {adaptedCvs.length > 0 && (
                  <div className="space-y-1 pt-3">
                    <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider px-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-purple-500" />
                      Variantes adaptées par offre
                    </span>
                    {adaptedCvs.map((cv, idx) => {
                      const isSelected = cv.id === selectedId;
                      return (
                        <div
                          key={`${cv.id}-${idx}`}
                          onClick={() => setSelectedId(cv.id)}
                          className={`group relative p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-white border-purple-600 shadow-2xs'
                              : 'bg-purple-50/40 border-purple-100 hover:border-purple-300 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              <span className="text-xs font-semibold text-zinc-900 truncate">{cv.name}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1.5 text-[10px] text-zinc-400">
                            <span>{Math.ceil(cv.bytes / 1024)} Ko</span>
                            <span>{new Date(cv.createdAt).toLocaleDateString('fr-CH')}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Colonne droite : Aperçu & Actions du document sélectionné */}
        <div className="flex-1 min-h-0 flex flex-col bg-white overflow-y-auto custom-scrollbar">
          {selectedCv && fileUrl ? (
            <div className="flex-1 flex flex-col min-h-0 p-4 sm:p-6 space-y-4">
              {/* Barre d'action du document */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-200/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-zinc-900">{selectedCv.name}.pdf</h2>
                    {selectedCv.isBase ? (
                      <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        CV de base utilisé pour les candidatures
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetBase(selectedCv.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 px-2 py-0.5 rounded-full transition-colors"
                        title="Définir comme CV de base pour le profil et l'agent"
                      >
                        <Star className="w-3 h-3 text-zinc-500" />
                        <span>Définir comme CV de base</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Importé le {new Date(selectedCv.createdAt).toLocaleString('fr-CH')} · {Math.ceil(selectedCv.bytes / 1024)} Ko
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${fileUrl}?download=1`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Télécharger</span>
                  </a>

                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Ouvrir dans un onglet</span>
                  </a>

                  {!selectedCv.isBase && (
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedCv.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
                      title="Supprimer ce fichier"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Supprimer</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Aperçu direct en iframe */}
              <div className="flex-1 min-h-[550px] rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 shadow-2xs">
                <iframe
                  key={selectedCv.id}
                  title={`Aperçu de ${selectedCv.name}`}
                  src={fileUrl}
                  className="w-full h-full min-h-[550px] bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-zinc-300" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-zinc-800">Aucun CV sélectionné</h3>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Sélectionnez un CV dans la colonne de gauche ou importez un nouveau document pour voir son aperçu.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
