import { readTable, mutateTable } from '../db.ts';
import { evaluateJobFilters } from '../../src/services/jobFilterEngine.ts';
import { generateTailoredCv, generateTailoredCoverLetter, runPlaywrightApplication } from '../../src/services/automationAgent.ts';

export type DisplayApplicationStatus = 'envoyee' | 'a_verifier' | 'intervention' | 'echec' | 'deja_envoyee' | 'simulee';
export type CampaignFinalStatus = 'sent' | 'requires_review' | 'already_submitted' | 'failed';

export function mapDisplayStatus(automationStatus: string): DisplayApplicationStatus {
  switch (automationStatus) {
    case 'sent':
      return 'envoyee';
    case 'simulated':
      return 'simulee';
    case 'requires_review':
      return 'a_verifier';
    case 'captcha':
    case 'missing_field':
      return 'intervention';
    case 'already_submitted':
      return 'deja_envoyee';
    default:
      return 'echec';
  }
}

export function formatDisplayStatusLabel(displayStatus: DisplayApplicationStatus): string {
  switch (displayStatus) {
    case 'envoyee':
      return 'Envoyée avec preuve';
    case 'simulee':
      return 'Simulée';
    case 'a_verifier':
      return 'À vérifier';
    case 'intervention':
      return 'Intervention nécessaire';
    case 'deja_envoyee':
      return 'Déjà envoyée';
    case 'echec':
    default:
      return 'Échec';
  }
}

export interface ApplyToJobOptions {
  headless?: boolean;
  simulate?: boolean;
  // Confirmation explicite avant l'envoi réel (si false avec simulate=false, bloque l'envoi réel)
  confirm_real_send?: boolean;
  // Renvoi explicite d'une offre dont le formulaire a déjà été soumis sans confirmation
  force_resubmit?: boolean;
  diagnostic?: {
    enabled?: boolean;
    outputDir?: string;
    holdMs?: number;
  };
}

export interface ApplyToJobResult {
  success: boolean;
  refused?: boolean;
  simulated?: boolean;
  error?: string;
  automation_result?: any;
  display_status?: DisplayApplicationStatus;
  display_label?: string;
  recommended_cv_id?: string;
  adaptation_reason?: string;
  base_ats_cv_filename?: string;
  tailored_cv_filename?: string;
  tailored_cv_path?: string;
  cover_letter_filename?: string;
  cover_letter_path?: string;
  cv_adapted_generated?: boolean;
  letter_generated?: boolean;
  upload_success?: boolean;
  cv_uploaded?: boolean;
  letter_uploaded?: boolean;
  summary_complete?: boolean;
  blocked_reason?: string | null;
  final_status?: CampaignFinalStatus;
  job_status?: string;
  submitted_unconfirmed?: boolean;
}

// ── Garde-fous de sécurité ────────────────────────────────────────────────────

// Verrou par offre : empêche deux envois simultanés pour la même offre (double clic, 1 clic pendant le panier)
const inFlightJobs = new Set<string>();

export function tryAcquireJobLock(jobId: string | number): boolean {
  const key = String(jobId);
  if (inFlightJobs.has(key)) return false;
  inFlightJobs.add(key);
  return true;
}

export function releaseJobLock(jobId: string | number): void {
  inFlightJobs.delete(String(jobId));
}

function actionLogsOf(result: any): string[] {
  const logs = result?.details?.actionLogs;
  return Array.isArray(logs) ? logs.map((l: any) => String(l)) : [];
}

// Vrai si le bouton d'envoi a été cliqué (ou simulé par le repli) mais que la confirmation n'a pas été observée
export function isSubmittedUnconfirmed(result: any): boolean {
  if (!result || result.status !== 'requires_review') return false;
  return actionLogsOf(result).some(
    (l) => /^Clicked submit button/i.test(l) || /^Simulated fallback submission/i.test(l)
  );
}

export function usedBrowserFallback(result: any): boolean {
  return actionLogsOf(result).some((l) => /^Browser launch fallback triggered/i.test(l));
}

// Le repli « navigateur indisponible » de l'agent est réservé aux tests : hors test, il ne doit jamais produire de faux « sent »
export function rejectBrowserFallback(result: any, nodeEnv: string | undefined = process.env.NODE_ENV): any {
  if (nodeEnv === 'test' || !usedBrowserFallback(result)) return result;
  return {
    status: 'error',
    message: 'Navigateur Playwright indisponible (lancement impossible). Candidature non confirmée : vérifie le site avant de réessayer.',
    details: {
      fieldsFilled: [],
      missingFields: [],
      unknownQuestions: [],
      captchaDetected: false,
      confirmationVerified: false,
      proofUrl: result?.details?.proofUrl,
      actionLogs: actionLogsOf(result)
    }
  };
}

/**
 * Fonction centrale d'envoi de candidature unique.
 * Utilisée à la fois par le bouton « Postuler » en 1 clic et par le traitement du Panier.
 */
export async function applyToJob(
  jobId: string | number,
  options?: ApplyToJobOptions
): Promise<ApplyToJobResult> {
  if (!tryAcquireJobLock(jobId)) {
    const message = 'Un envoi est déjà en cours pour cette offre. Attends la fin avant de relancer.';
    return {
      success: false,
      refused: true,
      error: message,
      display_status: 'echec',
      display_label: formatDisplayStatusLabel('echec'),
      automation_result: { status: 'refused_in_progress', message }
    };
  }
  try {
    return await applyToJobUnlocked(jobId, options);
  } finally {
    releaseJobLock(jobId);
  }
}

async function applyToJobUnlocked(
  jobId: string | number,
  options?: ApplyToJobOptions
): Promise<ApplyToJobResult> {
  const isSimulate = Boolean(options?.simulate);
  const jobs = readTable('jobs');
  const job = jobs.find((j: any) => String(j.id) === String(jobId));
  if (!job) {
    return { success: false, error: 'Offre non trouvée' };
  }

  const profile = readTable('user_profile')[0] || {};
  const settings = readTable('settings')[0] || {};

  // 1. REFUS STRICT DES OFFRES EXCLUES : Aucun CV généré, aucun navigateur ouvert
  const evalRes = evaluateJobFilters(job, profile);
  if (evalRes.isExcluded) {
    const reason = `Offre exclue par vos critères (${evalRes.primaryReason || 'critères non respectés'}). Aucun navigateur ouvert.`;
    return {
      success: false,
      refused: true,
      error: reason,
      cv_adapted_generated: false,
      letter_generated: false,
      upload_success: false,
      cv_uploaded: false,
      letter_uploaded: false,
      summary_complete: false,
      blocked_reason: reason,
      final_status: 'failed',
      automation_result: {
        status: 'refused_excluded',
        message: evalRes.primaryReason || 'Offre exclue par vos critères de filtrage.'
      }
    };
  }

  // 2. REFUS DES OFFRES DÉJÀ ENVOYÉES (jamais deux candidatures pour la même offre -> already_submitted)
  const existingApps = readTable('applications') || [];
  const alreadySent = existingApps.find(
    (a: any) => String(a.job_id) === String(jobId) && (a.status === 'Envoyée' || a.status === 'sent')
  );
  if (alreadySent) {
    const msg = 'Cette offre a déjà fait l’objet d’une candidature envoyée.';
    return {
      success: false,
      refused: true,
      error: msg,
      display_status: 'deja_envoyee',
      display_label: 'Déjà envoyée',
      cv_adapted_generated: Boolean(job.tailored_cv_filename),
      letter_generated: Boolean(job.cover_letter_filename),
      upload_success: true,
      summary_complete: true,
      blocked_reason: msg,
      final_status: 'already_submitted',
      automation_result: {
        status: 'already_submitted',
        message: 'Candidature déjà envoyée précédemment pour cette offre.'
      }
    };
  }

  // Étape 13 : Si simulate=false, demander confirmation explicite avant l'envoi réel
  if (!isSimulate && options?.confirm_real_send === false) {
    const confirmMsg = 'Confirmation explicite requise avant l’envoi réel de la candidature.';
    return {
      success: false,
      refused: true,
      error: confirmMsg,
      display_status: 'a_verifier',
      display_label: formatDisplayStatusLabel('a_verifier'),
      cv_adapted_generated: false,
      letter_generated: false,
      upload_success: false,
      summary_complete: false,
      blocked_reason: confirmMsg,
      final_status: 'requires_review',
      automation_result: {
        status: 'requires_review',
        message: confirmMsg
      }
    };
  }

  // 2b. REFUS DES OFFRES DONT LE FORMULAIRE A DÉJÀ ÉTÉ SOUMIS SANS CONFIRMATION
  if (!isSimulate && !options?.force_resubmit) {
    const pending = existingApps.find(
      (a: any) =>
        String(a.job_id) === String(jobId) &&
        a.submitted_unconfirmed === true &&
        a.status !== 'Envoyée' &&
        a.status !== 'sent'
    );
    if (pending) {
      const message = 'Le formulaire de cette offre a déjà été soumis sans confirmation. La candidature est peut-être déjà partie. Vérifie sur le site de l’entreprise avant de renvoyer.';
      return {
        success: false,
        refused: true,
        submitted_unconfirmed: true,
        error: message,
        display_status: 'a_verifier',
        display_label: formatDisplayStatusLabel('a_verifier'),
        cv_adapted_generated: Boolean(job.tailored_cv_filename),
        letter_generated: Boolean(job.cover_letter_filename),
        upload_success: false,
        summary_complete: false,
        blocked_reason: message,
        final_status: 'requires_review',
        automation_result: { status: 'requires_review', message }
      };
    }
  }

  // 3. Étapes 1 à 8 : Extraction base candidat, CV de base ATS, adaptation CV via ollamaCloud.generate et génération lettre PDF via ollamaCloud.generate
  let recommendedCvId = job.recommended_cv_id;
  let adaptationReason = job.adaptation_reason;
  let tailoredCvFilename = job.tailored_cv_filename;
  let tailoredCvPath = job.tailored_cv_path;
  let baseAtsCvFilename = job.base_ats_cv_filename;
  let coverLetterFilename = job.cover_letter_filename;
  let coverLetterPath = job.cover_letter_path;
  let coverLetterText = '';
  let cvAdaptedGenerated = false;
  let letterGenerated = false;

  try {
    const tailored = await generateTailoredCv(job, profile);
    recommendedCvId = tailored.recommendedCvId;
    adaptationReason = tailored.adaptationReason;
    tailoredCvFilename = tailored.tailoredCvFilename;
    tailoredCvPath = tailored.tailoredCvPath;
    baseAtsCvFilename = tailored.baseAtsCvFilename;
    cvAdaptedGenerated = true;

    const letterRes = await generateTailoredCoverLetter(job, profile, tailored.candidateBase);
    coverLetterFilename = letterRes.coverLetterFilename;
    coverLetterPath = letterRes.coverLetterPath;
    coverLetterText = letterRes.coverLetterText;
    letterGenerated = true;
  } catch (genErr: any) {
    const errMsg = genErr?.message || 'Erreur lors de la génération du CV adapté ou de la lettre de motivation.';
    return {
      success: false,
      refused: false,
      simulated: isSimulate,
      error: errMsg,
      display_status: 'echec',
      display_label: formatDisplayStatusLabel('echec'),
      recommended_cv_id: recommendedCvId,
      adaptation_reason: adaptationReason,
      base_ats_cv_filename: baseAtsCvFilename,
      tailored_cv_filename: tailoredCvFilename,
      tailored_cv_path: tailoredCvPath,
      cover_letter_filename: coverLetterFilename,
      cover_letter_path: coverLetterPath,
      cv_adapted_generated: cvAdaptedGenerated,
      letter_generated: letterGenerated,
      upload_success: false,
      cv_uploaded: false,
      letter_uploaded: false,
      summary_complete: false,
      blocked_reason: errMsg,
      final_status: 'failed',
      automation_result: {
        status: 'error',
        message: errMsg
      }
    };
  }

  // 4. Étapes 9 à 12 : Lancement de Playwright (upload CV adapté, upload lettre type="10", contrôle récapitulatif, simulation ou envoi)
  const isHeadless = options?.headless !== false;
  const rawResult = await runPlaywrightApplication(job, profile, settings, {
    cvPath: tailoredCvPath,
    cvFilename: tailoredCvFilename,
    coverLetterPath,
    coverLetterFilename,
    coverLetterText,
    headless: isHeadless,
    simulate: isSimulate,
    diagnostic: options?.diagnostic
  });
  const automationResult: any = rejectBrowserFallback(rawResult);
  const submittedUnconfirmed = !isSimulate && isSubmittedUnconfirmed(automationResult);

  const displayStatus = mapDisplayStatus(automationResult.status);
  const displayLabel = formatDisplayStatusLabel(displayStatus);

  const cvUploaded = Boolean(
    automationResult.details?.cvUploaded ??
    (Array.isArray(automationResult.details?.fieldsFilled) && automationResult.details.fieldsFilled.includes('cv_upload'))
  );
  const letterUploaded = Boolean(
    automationResult.details?.letterUploaded ??
    (Array.isArray(automationResult.details?.fieldsFilled) && automationResult.details.fieldsFilled.includes('cover_letter_upload'))
  );
  const letterRequired = Boolean(automationResult.details?.letterRequired);
  const uploadSuccess = Boolean(cvUploaded && (!letterRequired || letterUploaded));
  const summaryComplete = Boolean(
    automationResult.details?.summaryComplete ??
    (uploadSuccess && (automationResult.status === 'sent' || automationResult.status === 'simulated'))
  );

  let finalStatus: CampaignFinalStatus = 'failed';
  if (automationResult.status === 'already_submitted') {
    finalStatus = 'already_submitted';
  } else if (!isSimulate && automationResult.status === 'sent') {
    finalStatus = 'sent';
  } else if (
    (isSimulate && automationResult.status === 'simulated') ||
    (automationResult.status === 'requires_review' && uploadSuccess && summaryComplete)
  ) {
    finalStatus = 'requires_review';
  } else {
    finalStatus = 'failed';
  }

  const blockedReason: string | null =
    finalStatus === 'sent' || (isSimulate && automationResult.status === 'simulated')
      ? null
      : (automationResult.message || null);

  let appStatus = 'Envoyée';
  let jobStatus = 'Envoyée';
  if (isSimulate) {
    appStatus = 'Simulée';
    jobStatus = job.status || 'À postuler';
  } else if (automationResult.status === 'requires_review' || automationResult.status === 'captcha' || automationResult.status === 'missing_field') {
    appStatus = 'À vérifier';
    jobStatus = 'À postuler';
  } else if (automationResult.status === 'already_submitted') {
    appStatus = 'Envoyée';
    jobStatus = 'Envoyée';
  } else if (automationResult.status === 'error' || automationResult.status === 'unrecognized_form') {
    appStatus = 'Échec';
    jobStatus = 'À postuler';
  }

  const idempotencyKey = `${job.id}_${job.url || ''}_${tailoredCvFilename || profile.cv_filename || ''}`;

  // 5. Enregistrement de la candidature (jamais en simulation : pas de fausse ligne dans Candidatures)
  if (!isSimulate) {
    await mutateTable('applications', (currentApps) => {
      const existingIndex = currentApps.findIndex((a: any) => String(a.job_id) === String(jobId));
      const priorUnconfirmed = existingIndex !== -1 && currentApps[existingIndex].submitted_unconfirmed === true;
      const appRecord = {
        id: existingIndex !== -1 ? currentApps[existingIndex].id : Date.now(),
        job_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        canton: job.canton,
        url: job.url,
        source: job.source,
        status: appStatus,
        cv_filename: tailoredCvFilename || profile.cv_filename || recommendedCvId,
        idempotency_key: idempotencyKey,
        selection_reason: adaptationReason,
        blocked_reason: automationResult.message,
        created_at: new Date().toISOString(),
        sent_at: automationResult.status === 'sent' ? new Date().toISOString() : undefined,
        simulated: false,
        submitted_unconfirmed: automationResult.status === 'sent' ? false : (submittedUnconfirmed || priorUnconfirmed)
      };
      if (existingIndex !== -1) {
        currentApps[existingIndex] = { ...currentApps[existingIndex], ...appRecord };
        return [...currentApps];
      }
      return [appRecord, ...currentApps];
    });
  }

  // 6. Mise à jour de la table jobs avec le dernier résultat visible
  await mutateTable('jobs', (currentJobs) => {
    return currentJobs.map((j: any) => {
      if (String(j.id) === String(jobId)) {
        return {
          ...j,
          status: jobStatus,
          recommended_cv_id: recommendedCvId,
          adaptation_reason: adaptationReason,
          base_ats_cv_filename: baseAtsCvFilename,
          tailored_cv_filename: tailoredCvFilename,
          tailored_cv_path: tailoredCvPath,
          cover_letter_filename: coverLetterFilename,
          cover_letter_path: coverLetterPath,
          last_application_result: {
            status: automationResult.status,
            final_status: finalStatus,
            display_status: displayStatus,
            display_label: displayLabel,
            message: automationResult.message,
            cv_adapted_generated: cvAdaptedGenerated,
            letter_generated: letterGenerated,
            upload_success: uploadSuccess,
            cv_uploaded: cvUploaded,
            letter_uploaded: letterUploaded,
            summary_complete: summaryComplete,
            blocked_reason: blockedReason,
            timestamp: new Date().toISOString()
          },
          is_new: 0
        };
      }
      return j;
    });
  });

  // 7. Journalisation
  await mutateTable('scraping_logs', (logs) => {
    logs.unshift({
      id: Date.now(),
      source: 'automation_agent',
      level: automationResult.status === 'sent' ? 'info' : 'warning',
      message: `Candidature automatique [${job.company} - ${job.title}] : ${automationResult.message}`,
      timestamp: new Date().toISOString()
    });
    return logs.slice(0, 100);
  });

  return {
    success: isSimulate ? automationResult.status === 'simulated' : automationResult.status === 'sent',
    refused: false,
    simulated: isSimulate,
    automation_result: automationResult,
    display_status: displayStatus,
    display_label: displayLabel,
    recommended_cv_id: recommendedCvId,
    adaptation_reason: adaptationReason,
    base_ats_cv_filename: baseAtsCvFilename,
    tailored_cv_filename: tailoredCvFilename,
    tailored_cv_path: tailoredCvPath,
    cover_letter_filename: coverLetterFilename,
    cover_letter_path: coverLetterPath,
    cv_adapted_generated: cvAdaptedGenerated,
    letter_generated: letterGenerated,
    upload_success: uploadSuccess,
    cv_uploaded: cvUploaded,
    letter_uploaded: letterUploaded,
    summary_complete: summaryComplete,
    blocked_reason: blockedReason,
    final_status: finalStatus,
    job_status: jobStatus
  };
}
