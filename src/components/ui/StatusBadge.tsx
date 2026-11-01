import React from 'react';
import { RefreshCw } from 'lucide-react';

export type NormalizedStatus =
  | 'Essai'
  | 'En attente'
  | 'Envoyée avec preuve'
  | 'À vérifier'
  | 'En cours'
  | 'Bloquée'
  | 'Refusée'
  | 'Échec';

interface StatusBadgeProps {
  status: string;
  className?: string;
  dotOnly?: boolean;
}

export function normalizeStatus(raw: string): NormalizedStatus {
  const s = String(raw || '').trim().toLowerCase();

  // 1. En cours (incluant en_cours, en cours, En cours...)
  if (
    s === 'en_cours' ||
    s === 'en cours' ||
    s.includes('en cours') ||
    s === 'en_cours...'
  ) {
    return 'En cours';
  }

  // 2. Essai (simulé, simule, simulation)
  if (
    s === 'essai' ||
    s === 'simulé' ||
    s === 'simule' ||
    s === 'simulation' ||
    s === 'simulee' ||
    s === 'simulée' ||
    s.includes('essai') ||
    s.includes('simul')
  ) {
    return 'Essai';
  }

  // 3. Envoyée avec preuve (envoyée, envoyee, sent, postulé, deja_envoyee)
  if (
    s === 'envoyée avec preuve' ||
    s === 'envoyee avec preuve' ||
    s === 'envoyée' ||
    s === 'envoyee' ||
    s === 'sent' ||
    s === 'postule' ||
    s === 'postulé' ||
    s.includes('envoyée') ||
    s.includes('envoyee') ||
    s === 'already_submitted' ||
    s === 'deja_envoyee' ||
    s === 'déjà envoyée' ||
    s === 'deja envoyee'
  ) {
    return 'Envoyée avec preuve';
  }

  // 4. À vérifier (a_verifier, requires_review, submitted_unconfirmed)
  if (
    s === 'à vérifier' ||
    s === 'a verifier' ||
    s === 'a_verifier' ||
    s === 'requires_review' ||
    s === 'submitted_unconfirmed' ||
    s.includes('vérifier') ||
    s.includes('verifier')
  ) {
    return 'À vérifier';
  }

  // 5. Bloquée (intervention, captcha, missing_field, Intervention nécessaire)
  if (
    s === 'bloquée' ||
    s === 'bloquee' ||
    s === 'blocked' ||
    s === 'intervention' ||
    s === 'captcha' ||
    s === 'missing_field' ||
    s === 'intervention nécessaire' ||
    s === 'intervention necessaire'
  ) {
    return 'Bloquée';
  }

  // 6. Refusée (séparé en gris, jamais bloquée)
  if (
    s === 'refusée' ||
    s === 'refusee' ||
    s === 'rejected' ||
    s === 'exclue' ||
    s === 'exclu' ||
    s === 'pas intéressé' ||
    s === 'pas interesse'
  ) {
    return 'Refusée';
  }

  // 7. Échec (echec, failed, error, erreur)
  if (
    s === 'échec' ||
    s === 'echec' ||
    s === 'failed' ||
    s === 'error' ||
    s === 'erreur'
  ) {
    return 'Échec';
  }

  // 8. En attente (par défaut)
  return 'En attente';
}

const BADGE_BASE = 'inline-flex h-6 shrink-0 items-center gap-2 rounded-full px-2 text-caption font-medium';

const STYLES: Record<NormalizedStatus, { box: string; dot: string }> = {
  'En cours': { box: 'bg-blue-50 text-blue-800', dot: 'bg-blue-500' },
  'Essai': { box: 'bg-purple-50 text-purple-800', dot: 'bg-purple-500' },
  'Envoyée avec preuve': { box: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  'À vérifier': { box: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  'Bloquée': { box: 'bg-red-50 text-red-800', dot: 'bg-red-500' },
  'Refusée': { box: 'bg-black/5 text-muted', dot: 'bg-zinc-400' },
  'Échec': { box: 'bg-red-100 text-red-900', dot: 'bg-red-600' },
  'En attente': { box: 'bg-black/5 text-ink/70', dot: 'bg-zinc-400' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  dotOnly = false,
}) => {
  const rawText = String(status || '').trim();
  const norm = normalizeStatus(rawText);
  const isRecognized = norm in STYLES && rawText !== '';

  // Statut non reconnu et non vide : texte brut en gris neutre
  if (rawText && !isRecognized) {
    if (dotOnly) {
      return <span className={`inline-block size-2 rounded-full bg-zinc-400 ${className}`} title={rawText} />;
    }
    return (
      <span className={`${BADGE_BASE} bg-black/5 text-ink/70 ${className}`}>
        <span className='size-1.5 shrink-0 rounded-full bg-zinc-400' />
        <span>{rawText}</span>
      </span>
    );
  }

  const { box, dot } = STYLES[norm];

  if (dotOnly) {
    return <span className={`inline-block size-2 rounded-full ${dot} ${className}`} title={norm} />;
  }

  return (
    <span className={`${BADGE_BASE} ${box} ${className}`}>
      {norm === 'En cours' ? (
        <RefreshCw className='size-3 shrink-0 animate-spin text-blue-600' />
      ) : (
        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      )}
      <span>{norm}</span>
    </span>
  );
};
