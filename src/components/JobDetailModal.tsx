import React, { useEffect, useState } from 'react';
import { Job } from '../types';
import { updateJobStatus, autoApplyJob } from '../services/api';
import { sourceLabel } from '../lib/sources';
import { employerLabel, originPortal, workloadLabel, relativeDate, normalizeJobUrl } from '../lib/jobs';
import { FormattedDescription } from './FormattedDescription';
import { StatusDropdown } from './ui/StatusDropdown';
import { Alert, Button } from './ui';
import type { AlertTone } from './ui/Alert';
import { Play, ExternalLink } from 'lucide-react';
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

const APPLY_TONE: Record<string, AlertTone> = { sent: 'success', requires_review: 'warning' };
const APPLY_LABEL: Record<string, string> = { sent: 'Candidature envoyée', requires_review: 'Relecture requise' };

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
    <article className='custom-scrollbar min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto bg-white px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10'>
      <header className='space-y-2'>
        <h1 className='break-words text-title font-semibold text-ink'>{job.title}</h1>
        <p className='text-body text-muted'>{meta.join(' · ')}</p>

        <div className='flex flex-wrap items-center gap-2 pt-2'>
          <StatusDropdown value={status} options={STATUS_OPTIONS} onChange={handleStatusChange} disabled={saving} label='Statut de suivi' />

          {normalizeJobUrl(job.url) && (
            <Button variant='secondary' size='sm' onClick={() => window.open(normalizeJobUrl(job.url), '_blank', 'noopener,noreferrer')}>
              <ExternalLink className='size-4' />
              <span>Voir l'offre{origin ? ` sur ${origin}` : ''}</span>
            </Button>
          )}

          <Button variant='accent' size='sm' onClick={handleAutoApply} disabled={applying}>
            <Play className='size-4' />
            {applying ? 'Agent en cours...' : 'Postuler'}
          </Button>
        </div>
      </header>

      {actionError && <Alert tone='error'>{actionError}</Alert>}

      {applyResult && (
        <Alert tone={APPLY_TONE[applyResult.status] ?? 'error'}>
          <p className='font-medium'>{APPLY_LABEL[applyResult.status] ?? `Échec : ${applyResult.status}`}</p>
          <p>{applyResult.message}</p>
          {applyResult.details && (
            <p className='pt-2 text-caption'>
              Champs remplis : {applyResult.details.fieldsFilled.join(', ') || 'aucun'}
              {applyResult.details.unknownQuestions?.length > 0 && (
                <span className='block font-medium'>Questions inconnues : {applyResult.details.unknownQuestions.join(', ')}</span>
              )}
            </p>
          )}
        </Alert>
      )}

      {job.is_excluded && (
        <Alert tone='error'>
          <p className='font-medium'>
            {exclusionRules.length > 1 ? `Offre masquée par ${exclusionRules.length} règles d'exclusion :` : "Offre masquée par une règle d'exclusion :"}
          </p>
          <span className='flex flex-wrap items-center gap-2 pt-2'>
            {exclusionRules.map((rule, idx) => (
              <span key={`rule-${idx}-${rule}`} className='inline-flex h-6 items-center rounded-control bg-rose-100 px-2 text-caption font-medium'>
                {formatReason(rule)}
              </span>
            ))}
          </span>
        </Alert>
      )}

      <section aria-label="Description de l'offre" className='border-t border-line pt-6'>
        <FormattedDescription text={job.description || ''} />
      </section>

      <footer className='flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 text-caption text-muted'>
        <span>Source : {sourceLabel(job.source)}</span>
        {job.external_id && <span>ID : {job.external_id}</span>}
      </footer>
    </article>
  );
};
