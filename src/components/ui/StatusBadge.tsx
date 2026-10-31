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

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className = '',
  dotOnly = false,
}) => {
  const rawText = String(status || '').trim();
  const norm = normalizeStatus(rawText);
  const isRecognized = [
    'En cours',
    'Essai',
    'Envoyée avec preuve',
    'À vérifier',
    'Bloquée',
    'Refusée',
    'Échec',
    'En attente'
  ].includes(norm) && rawText !== '';

  // Si le statut n'est pas reconnu explicitement et n'est pas vide, on affiche son texte brut en gris neutre
  if (rawText && !isRecognized) {
    if (dotOnly) {
      return <span className={`inline-block w-2 h-2 rounded-full bg-zinc-400 ${className}`} title={rawText} />;
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 bg-zinc-100 text-zinc-700 border-zinc-200 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-400" />
        <span>{rawText}</span>
      </span>
    );
  }

  let styles = 'bg-zinc-100 text-zinc-700 border-zinc-200';
  let dotColor = 'bg-zinc-400';

  switch (norm) {
    case 'En cours':
      styles = 'bg-blue-50 text-blue-700 border-blue-200';
      dotColor = 'bg-blue-500';
      break;
    case 'Essai':
      styles = 'bg-purple-50 text-purple-700 border-purple-200/80';
      dotColor = 'bg-purple-500';
      break;
    case 'Envoyée avec preuve':
      styles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      dotColor = 'bg-emerald-500';
      break;
    case 'À vérifier':
      styles = 'bg-amber-50 text-amber-700 border-amber-200';
      dotColor = 'bg-amber-500';
      break;
    case 'Bloquée':
      styles = 'bg-red-50 text-red-700 border-red-200';
      dotColor = 'bg-red-500';
      break;
    case 'Refusée':
      styles = 'bg-zinc-100 text-zinc-600 border-zinc-200';
      dotColor = 'bg-zinc-400';
      break;
    case 'Échec':
      styles = 'bg-red-100 text-red-800 border-red-300';
      dotColor = 'bg-red-600';
      break;
    case 'En attente':
    default:
      styles = 'bg-zinc-100 text-zinc-700 border-zinc-200';
      dotColor = 'bg-zinc-400';
      break;
  }

  if (dotOnly) {
    return <span className={`inline-block w-2 h-2 rounded-full ${dotColor} ${className}`} title={norm} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${styles} ${className}`}
    >
      {norm === 'En cours' ? (
        <RefreshCw className="w-3 h-3 animate-spin text-blue-600 shrink-0" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      )}
      <span>{norm}</span>
    </span>
  );
};
