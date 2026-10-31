import React, { useEffect, useState } from 'react';
import { Job } from '../types';
import { updateJobStatus, autoApplyJob } from '../services/api';
import { sourceLabel } from '../lib/sources';
import { employerLabel, originPortal, workloadLabel, relativeDate, normalizeJobUrl } from '../lib/jobs';
import { FormattedDescription } from './FormattedDescription';
import { StatusDropdown } from './ui/StatusDropdown';
import { Alert, Button } from './ui';
import { Play, CheckCircle2, AlertTriangle, ShieldAlert, ExternalLink } from 'lucide-react';
import { formatReason } from '../lib/formatReason';

interface JobDetailModalProps {
  job: Job & { recommended_cv_id?: string; adaptation_reason?: string };
  onStatusUpdated: (status?: string) => void;
  panel?: boolean;
  onClose?: () => void;
}

const JOB_STATUSES = ['Nouvelle', 'Intéressante', 'À postuler', 'Envoyée', 'Refusée', 'Archivée'] as const;
type JobStatus = (typeof JOB_STATUSES)[number];
const STATUS_OPTIONS = JOB_STATUSES.map((value) => ({ value }));
const isJobStatus = (value: string): value is JobStatus => (JOB_STATUSES as readonly string[]).includes(value);

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onStatusUpdated }) => {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>(isJobStatus(job.status) ? job.status : 'Nouvelle');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any | null>(null);

  useEffect(() => {
    setStatus(isJobStatus(job.status) ? job.status : 'Nouvelle');
    setApplyResult(null);
    setActionError(null);
  }, [job]);

  const origin = originPortal(job.url);
  const pubDate = relativeDate(job.published_at);
  const location = job.location || 'Suisse';
  const place = job.canton && !new RegExp(`\\b${job.canton}\\b`, 'i').test(location) ? `${location} (${job.canton})` : location;
  const meta = [employerLabel(job), place, job.contract_type, /\d\s*%/.test(job.title) ? '' : workloadLabel(job.workload), pubDate].filter(Boolean);

  const handleStatusChange = async (newStatus: string) => {
    if (!isJobStatus(newStatus) || saving || newStatus === status) return;
    setSaving(true); setActionError(null);
    try {
      await updateJobStatus(job.id, newStatus);
      setStatus(newStatus);
      onStatusUpdated(newStatus);
    } catch (e: any) {
      setActionError(`Changement de statut impossible : ${e?.response?.data?.error || e?.message || 'erreur inconnue'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoApply = async () => {
    setApplying(true); setActionError(null); setApplyResult(null);
    try {
      const res = await autoApplyJob(job.id);
      if (res.automation_result) {
        setApplyResult(res.automation_result);
        onStatusUpdated(res.automation_result.status === 'sent' ? 'Envoyée' : undefined);
      } else if (res.error) {
        setActionError(res.error);
      }
    } catch (e: any) {
      setActionError(`Erreur lors de la postulation automatique Playwright : ${e?.response?.data?.error || e?.message}`);
    } finally {
      setApplying(false);
    }
  };

  const exclusionRules = job.matched_exclusions?.length ? job.matched_exclusions : [job.exclusion_reason || "Règle d'exclusion"];

  return (
    <article className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar bg-white px-4 sm:px-10 pt-3 sm:pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4">
      <header className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug text-zinc-900 break-words">{job.title}</h1>
        <p className="text-sm text-zinc-500 leading-6">{meta.join(' · ')}</p>

        {/* Actions : Statut + Voir l'offre + Postuler */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <StatusDropdown value={status} options={STATUS_OPTIONS} onChange={handleStatusChange} disabled={saving} label="Statut de suivi" />

          {/* Voir l'offre sur le site original */}
          {normalizeJobUrl(job.url) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(normalizeJobUrl(job.url), '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-1.5 text-zinc-700"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Voir l'offre{origin ? ` sur ${origin}` : ''}</span>
            </Button>
          )}

          {/* Postuler (Playwright — sélectionne le CV + génère la lettre + postule) */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleAutoApply}
            disabled={applying}
            className="inline-flex items-center gap-1.5 font-semibold bg-red-600 hover:bg-red-700 text-white shadow-2xs"
          >
            <Play className="w-4 h-4 fill-current" />
            {applying ? 'Agent en cours...' : 'Postuler'}
          </Button>
        </div>
      </header>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {/* Résultat de la postulation automatique Playwright */}
      {applyResult && (
        <div className={`p-4 rounded-lg border text-sm space-y-2 ${
          applyResult.status === 'sent' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' :
          applyResult.status === 'requires_review' ? 'bg-amber-50 border-amber-300 text-amber-900' :
          'bg-rose-50 border-rose-300 text-rose-900'
        }`}>
          <div className="flex items-center gap-2 font-bold">
            {applyResult.status === 'sent' && <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />}
            {applyResult.status === 'requires_review' && <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />}
            {applyResult.status !== 'sent' && applyResult.status !== 'requires_review' && <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />}
            <span>Résultat Agent : {applyResult.status.toUpperCase()}</span>
          </div>
          <p className="text-xs leading-relaxed">{applyResult.message}</p>
          {applyResult.details && (
            <div className="text-xs font-mono pt-1 text-zinc-700 space-y-0.5">
              <div>Champs remplis : {applyResult.details.fieldsFilled.join(', ') || 'aucun'}</div>
              {applyResult.details.unknownQuestions?.length > 0 && (
                <div className="text-amber-800 font-semibold">Questions inconnues : {applyResult.details.unknownQuestions.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Offre exclue — raison(s) lisible(s) */}
      {job.is_excluded && (
        <Alert tone="error">
          <span className="font-semibold block">{exclusionRules.length > 1 ? `Offre masquée par ${exclusionRules.length} règles d'exclusion :` : "Offre masquée par une règle d'exclusion :"}</span>
          <span className="flex flex-wrap items-center gap-1.5 mt-2">
            {exclusionRules.map((rule, idx) => (
              <span key={`rule-${idx}-${rule}`} className="inline-flex items-center px-2.5 py-1 rounded-md bg-rose-100 border border-rose-300 text-rose-900 font-medium text-xs">
                {formatReason(rule)}
              </span>
            ))}
          </span>
        </Alert>
      )}

      <section aria-label="Description de l'offre" className="border-t border-zinc-200/80 pt-3">
        <FormattedDescription text={job.description || ''} />
      </section>

      {/* Source */}
      <footer className="pt-2 border-t border-zinc-200/80 text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>Source : {sourceLabel(job.source)}</span>
        {job.external_id && <span>ID : {job.external_id}</span>}
      </footer>
    </article>
  );
};
