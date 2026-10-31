import fs from 'fs';
import path from 'path';
import { checkJobExclusions } from './exclusionMatcher.ts';
import { evaluateJobFilters } from './jobFilterEngine.ts';
import { getZurichDateString, formatZurichDateTime } from './zurichTime.ts';
import {
  Job,
  Application,
  ApplicationStatus,
  SubmissionProof,
  PipelineStatus,
  PipelineRunReport,
  UserProfile,
  Settings
} from '../types.ts';

export interface AutonomousContext {
  dataDir: string;
  readTable: (table: string) => any[];
  writeTable: (table: string, data: any[]) => Promise<boolean>;
  mutateTable: (table: string, mutator: (data: any[]) => any[]) => Promise<{ success: boolean; data?: any[] }>;
  runScraperForSource?: (sourceName: string) => Promise<any>;
}

let context: AutonomousContext | null = null;
let schedulerTimer: NodeJS.Timeout | null = null;
let isCycleRunning = false;
let lastRunTimestamp: string | null = null;
let nextRunTimestamp: string | null = null;
let consecutiveErrors = 0;
let lastReport: PipelineRunReport | null = null;

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/g;
const IGNORED_EMAILS = ['example.com', 'domain.com', 'test.com', 'sentry.io', 'noreply', 'donotreply'];

/**
 * Migrates and preserves settings, converting legacy parameters cleanly.
 * Guarantees interval_minutes as primary unit (min 60 min), auto_scrape_interval = 0,
 * separate daily_submission_quota, separate max_candidates_per_cycle,
 * scheduler_active false by default, and locked simulation mode.
 */
export function migrateSettings(rawSettings: any = {}): Settings {
  const settings: any = { ...rawSettings };

  // 1. Interval in minutes (minimum 60 minutes, manual scrape only)
  const parsedMin = typeof settings.interval_minutes === 'number' && Number.isFinite(settings.interval_minutes)
    ? settings.interval_minutes
    : (typeof settings.auto_scrape_interval === 'number' && Number.isFinite(settings.auto_scrape_interval) ? settings.auto_scrape_interval : 60);
  
  settings.interval_minutes = Math.max(60, Math.round(parsedMin));
  settings.auto_scrape_interval = 0; // Récupération automatique désactivée (récupération manuelle seulement)

  // 2. Limit per cycle (max candidates prepared per run)
  if (typeof settings.max_candidates_per_cycle !== 'number' || !Number.isFinite(settings.max_candidates_per_cycle)) {
    settings.max_candidates_per_cycle = 2;
  } else {
    settings.max_candidates_per_cycle = Math.max(1, Math.round(settings.max_candidates_per_cycle));
  }

  // 3. Daily submission quota (based on Europe/Zurich civil calendar day)
  if (typeof settings.daily_submission_quota === 'number' && Number.isFinite(settings.daily_submission_quota)) {
    settings.daily_submission_quota = Math.max(1, Math.round(settings.daily_submission_quota));
  } else if (typeof settings.daily_application_limit === 'number' && Number.isFinite(settings.daily_application_limit)) {
    settings.daily_submission_quota = Math.max(1, Math.round(settings.daily_application_limit));
  } else {
    settings.daily_submission_quota = 5;
  }
  settings.daily_application_limit = settings.daily_submission_quota;

  // 4. Scheduler active state (default false / off)
  if (settings.scheduler_active === undefined) {
    settings.scheduler_active = false;
  } else {
    settings.scheduler_active = Boolean(settings.scheduler_active);
  }

  // 5. Strict simulation mode enforcement (cannot enter real mode without explicit allow_real_submissions)
  if (rawSettings?.allow_real_submissions !== true) {
    settings.scheduler_mode = 'simulation';
    settings.simulation_mode = true;
  } else {
    settings.scheduler_mode = rawSettings.scheduler_mode || 'simulation';
    settings.simulation_mode = rawSettings.simulation_mode ?? true;
  }

  return settings as Settings;
}

/**
 * Dynamically resolves the candidate's CV file and checks physical existence on disk.
 * Strictly avoids hardcoded fallback names like 'cv_jean.pdf'.
 */
export function resolveCvFile(profile: UserProfile, dataDir?: string): {
  exists: boolean;
  filename: string;
  resolvedPath: string | null;
  errorReason?: string;
} {
  const filename = (profile?.cv_filename || '').trim();
  const customPath = (profile?.cv_path || '').trim();

  if (!filename && !customPath) {
    return {
      exists: false,
      filename: '',
      resolvedPath: null,
      errorReason: 'Aucun fichier CV configuré dans votre profil. Veuillez renseigner ou téléverser votre CV dans Profil.'
    };
  }

  const targetName = customPath || filename;
  const candidates: string[] = [
    targetName,
    path.isAbsolute(targetName) ? targetName : '',
    dataDir ? path.join(dataDir, targetName) : '',
    dataDir ? path.join(dataDir, '..', 'uploads', targetName) : '',
    path.join(process.cwd(), 'uploads', targetName),
    path.join(process.cwd(), 'data', targetName),
  ].filter(Boolean);

  for (const candidatePath of candidates) {
    try {
      if (fs.existsSync(candidatePath)) {
        const stat = fs.statSync(candidatePath);
        if (stat.isFile()) {
          return {
            exists: true,
            filename: path.basename(candidatePath),
            resolvedPath: candidatePath
          };
        }
      }
    } catch (e) {}
  }

  return {
    exists: false,
    filename: targetName,
    resolvedPath: null,
    errorReason: `Fichier CV configuré introuvable sur le disque (« ${targetName} »). Veuillez vérifier son emplacement ou le téléverser à nouveau.`
  };
}

/**
 * Detects application channel from job description and URL
 */
export function detectJobChannel(job: Job): { channel: 'email' | 'form' | 'site'; target: string } {
  const text = `${job.description || ''} ${job.url || ''}`;
  const matches = text.match(EMAIL_REGEX);
  if (matches && matches.length > 0) {
    const validEmail = matches.find(email => {
      const lower = email.toLowerCase();
      return !IGNORED_EMAILS.some(ignored => lower.includes(ignored));
    });
    if (validEmail) {
      return { channel: 'email', target: validEmail };
    }
  }

  const url = (job.url || '').toLowerCase();
  if (
    url.includes('jobup.ch') ||
    url.includes('jobs.ch') ||
    url.includes('job-room.ch') ||
    url.includes('linkedin.com') ||
    url.includes('indeed.com') ||
    url.includes('greenhouse.io') ||
    url.includes('lever.co') ||
    url.includes('workday.com') ||
    url.includes('smartrecruiters.com') ||
    url.includes('recruitee.com')
  ) {
    return { channel: 'form', target: job.url || 'Portail de recrutement officiel' };
  }

  return { channel: 'site', target: job.url || 'Site carrière de l’employeur' };
}

/**
 * Generates a tailored, strictly factual cover letter grounded exclusively in the candidate's verified profile.
 * Zero hallucination of skills, companies, degrees, or personal data.
 */
export function generateTailoredLetter(job: Job, profile: UserProfile): string {
  const candidateName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Candidat';
  const candidateEmail = profile.email || '';
  const candidatePhone = profile.phone || '';
  const candidateCity = [profile.city, profile.canton].filter(Boolean).join(' ') || 'Suisse';

  const title = job.title || 'le poste proposé';
  const company = job.company || 'votre entreprise';

  // Extract real experiences
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  let expParagraph = '';
  if (experiences.length > 0) {
    const primaryExp = experiences[0];
    const achievements = Array.isArray(primaryExp.achievements) && primaryExp.achievements.length > 0
      ? primaryExp.achievements.slice(0, 2).map(a => `• ${a}`).join('\n')
      : (Array.isArray(primaryExp.realizations) && primaryExp.realizations.length > 0
        ? primaryExp.realizations.slice(0, 2).map(r => `• ${r}`).join('\n')
        : '');

    expParagraph = `Au cours de mon parcours professionnel, notamment en tant que ${primaryExp.title} chez ${primaryExp.company}${primaryExp.location ? ` (${primaryExp.location})` : ''}, j'ai développé une solide expertise de terrain.${achievements ? `\n\nPrincipales réalisations :\n${achievements}` : ''}`;
  }

  // Extract matching real skills
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const relevantSkills = skills.slice(0, 4);
  const skillsText = relevantSkills.length > 0
    ? `Mes compétences clés couvrent notamment : ${relevantSkills.join(', ')}.`
    : '';

  // Formations
  const formations = Array.isArray(profile.formations) ? profile.formations : [];
  const formationText = formations.length > 0 && formations[0].diploma
    ? `Titulaire d'un ${formations[0].diploma}${formations[0].institution ? ` (${formations[0].institution})` : ''}, je m'attache à allier rigueur méthodologique et sens du résultat.`
    : '';

  const permitText = profile.swiss_permit
    ? `Statut de séjour & travail : ${profile.swiss_permit}.`
    : '';

  return `${candidateName}
${candidateEmail ? `${candidateEmail} | ` : ''}${candidatePhone ? `${candidatePhone} | ` : ''}${candidateCity}

À l'attention de l'équipe de recrutement
${company}
${job.location ? `${job.location} (${job.canton || 'CH'})` : 'Suisse'}

Objet : Candidature au poste de ${title}

Madame, Monsieur,

C'est avec un vif intérêt que je vous adresse ma candidature pour le poste de ${title} au sein de ${company}.

${expParagraph}

${skillsText}

${formationText}
${permitText ? `\n${permitText}\n` : ''}
Désireux de mettre mon dynamisme et mon professionnalisme au service de vos projets, je serais ravi de vous rencontrer lors d'un entretien pour échanger de vive voix sur notre future collaboration.

Je vous remercie pour l'attention portée à mon dossier et vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

${candidateName}`;
}

export interface EligibilityResult {
  isEligible: boolean;
  status: ApplicationStatus;
  reason: string;
  missingInfo?: string[];
}

/**
 * Checks if a job meets strict criteria for autonomous submission.
 * Uses evaluateJobFilters (same engine as JobsView.tsx).
 */
export function evaluateJobEligibility(
  job: Job,
  profile: UserProfile,
  settings: Settings,
  existingApplications: Application[]
): EligibilityResult {
  // 1. Deduplication check: Has candidate already applied or simulation created?
  const alreadyApplied = existingApplications.some(app => {
    if (app.job_id && app.job_id === job.id) return true;
    const sameTitle = (app.title || '').trim().toLowerCase() === (job.title || '').trim().toLowerCase();
    const sameCompany = (app.company || '').trim().toLowerCase() === (job.company || '').trim().toLowerCase();
    return sameTitle && sameCompany;
  });

  if (alreadyApplied) {
    return {
      isEligible: false,
      status: 'Refusée',
      reason: 'Candidature déjà existante ou traitée pour cette offre (dédoublonnage strict).'
    };
  }

  // 2. Filter evaluation via evaluateJobFilters (same engine as JobsView.tsx)
  const filterResult = evaluateJobFilters(job, profile as any);
  if (filterResult.isExcluded) {
    return {
      isEligible: false,
      status: 'Refusée',
      reason: filterResult.primaryReason || filterResult.reasons.join(' ; ') || 'Exclue par les filtres.'
    };
  }

  // 3. Critical information completeness check
  const missing: string[] = [];
  if (!job.title || job.title.trim().length < 3) missing.push('titre');
  if (!job.company || job.company.trim().length < 2) missing.push('entreprise');
  if (!job.description || job.description.trim().length < 60) missing.push('description détaillée');

  if (missing.length > 0) {
    return {
      isEligible: false,
      status: 'À vérifier',
      reason: `Informations indispensables manquantes pour sécuriser le dossier : ${missing.join(', ')}.`,
      missingInfo: missing
    };
  }

  return {
    isEligible: true,
    status: 'Sélectionnée',
    reason: `Offre qualifiée et validée par les filtres.`
  };
}

/**
 * Initializes the autonomous pipeline background agent
 */
export function initAutonomousPipeline(ctx: AutonomousContext) {
  context = ctx;

  // Read stored settings and migrate cleanly
  const settingsList = ctx.readTable('settings');
  const rawSettings = settingsList[0] || {};
  const currentSettings = migrateSettings(rawSettings);
  const isEnabled = Boolean(currentSettings.scheduler_active);

  console.log(`[AutonomousPipeline] Initialisation. État : ${isEnabled ? 'ACTIF' : 'EN PAUSE'} (intervalle: ${currentSettings.interval_minutes} min, quota Zurich: ${currentSettings.daily_submission_quota}/jour, mode: SIMULATION).`);

  if (isEnabled) {
    startSchedulerLoop(currentSettings.interval_minutes);
  }
}

/**
 * Starts the periodic background scheduler loop
 */
function startSchedulerLoop(intervalMinutes: number) {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  const safeMinutes = Math.max(60, intervalMinutes);
  const intervalMs = safeMinutes * 60 * 1000;
  nextRunTimestamp = new Date(Date.now() + intervalMs).toISOString();

  schedulerTimer = setInterval(async () => {
    try {
      console.log('[AutonomousPipeline] Déclenchement automatique du cycle de fond...');
      await runAutonomousCycle();
    } catch (err: any) {
      console.error('[AutonomousPipeline] Erreur lors du cycle automatique :', err.message);
    }
  }, intervalMs);

  if (typeof schedulerTimer.unref === 'function') {
    schedulerTimer.unref();
  }
}

/**
 * Returns current status of the autonomous pipeline
 */
export function getPipelineStatus(): PipelineStatus {
  const todayZurichStr = getZurichDateString();

  if (!context) {
    return {
      active: false,
      interval_minutes: 60,
      mode: 'simulation',
      is_running: false,
      last_run: null,
      next_run: null,
      consecutive_errors: 0,
      daily_submission_quota: 5,
      daily_submissions_count: 0,
      max_candidates_per_cycle: 2,
      zurich_today_date: todayZurichStr,
      daily_submission_limit: 5,
      last_report: null
    };
  }

  const rawSettings = context.readTable('settings')[0] || {};
  const settings = migrateSettings(rawSettings);
  const applications: Application[] = context.readTable('applications');

  // Count simulated or sent applications on current Zurich civil calendar day
  const dailyCount = applications.filter(a => {
    if (a.status !== 'Simulé' && a.status !== 'Envoyée') return false;
    const dateField = a.sent_at || a.created_at;
    return Boolean(dateField && getZurichDateString(dateField) === todayZurichStr);
  }).length;

  return {
    active: Boolean(settings.scheduler_active) && Boolean(schedulerTimer),
    interval_minutes: settings.interval_minutes,
    mode: 'simulation', // Strictly locked to simulation
    is_running: isCycleRunning,
    last_run: lastRunTimestamp,
    next_run: nextRunTimestamp,
    consecutive_errors: consecutiveErrors,
    daily_submission_quota: settings.daily_submission_quota,
    daily_submissions_count: dailyCount,
    max_candidates_per_cycle: settings.max_candidates_per_cycle,
    zurich_today_date: todayZurichStr,
    daily_submission_limit: settings.daily_submission_quota,
    last_report: lastReport
  };
}

/**
 * Toggles the autonomous pipeline between active and paused
 */
export async function togglePipeline(active?: boolean): Promise<PipelineStatus> {
  if (!context) throw new Error('Contexte du pipeline non initialisé');

  const settingsList = context.readTable('settings');
  const rawSettings = settingsList[0] || {};
  const currentSettings = migrateSettings(rawSettings);
  const shouldBeActive = active !== undefined ? active : !currentSettings.scheduler_active;

  currentSettings.scheduler_active = shouldBeActive;
  currentSettings.scheduler_mode = 'simulation';
  currentSettings.simulation_mode = true;

  await context.writeTable('settings', [currentSettings]);

  if (shouldBeActive) {
    startSchedulerLoop(currentSettings.interval_minutes);
  } else {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
    nextRunTimestamp = null;
  }

  return getPipelineStatus();
}

/**
 * Runs a complete autonomous cycle in strict simulation mode:
 * 1. Checks daily quota for Europe/Zurich civil day and cycle limit
 * 2. Processes ONLY jobs in the cart (using evaluateJobFilters)
 * 3. Dynamically verifies physical presence of CV on disk
 * 4. Generates factual tailored cover letters without hallucination
 * 5. Generates simulation audit receipt with status 'Simulé'
 */
export async function runAutonomousCycle(force = false): Promise<PipelineRunReport> {
  if (!context) throw new Error('Pipeline non initialisé');
  if (isCycleRunning) {
    console.warn('[AutonomousPipeline] Un cycle est déjà en cours. Requête ignorée.');
    if (lastReport) return lastReport;
    throw new Error('Un cycle autonome est déjà en cours d’exécution');
  }

  isCycleRunning = true;
  const startMs = Date.now();
  const startTimeIso = new Date(startMs).toISOString();
  lastRunTimestamp = startTimeIso;

  const reportItems: PipelineRunReport['items'] = [];
  const sourcesQueried: string[] = [];
  let jobsScrapedCount = 0;
  let jobsNewSaved = 0;
  let selectedCount = 0;
  let preparedCount = 0;
  let submittedCount = 0;
  let blockedCount = 0;
  let needsReviewCount = 0;

  try {
    const profile: UserProfile = context.readTable('user_profile')[0] || {};
    const rawSettings = context.readTable('settings')[0] || {};
    const settings = migrateSettings(rawSettings);

    const dailyQuota = settings.daily_submission_quota || 5;
    const maxPerCycle = settings.max_candidates_per_cycle || 2;

    // Quota check strictly based on current Europe/Zurich civil calendar day (midnight to midnight)
    const existingApps: Application[] = context.readTable('applications');
    const todayZurichStr = getZurichDateString(startMs);
    const todayZurichCount = existingApps.filter(a => {
      if (a.status !== 'Simulé' && a.status !== 'Envoyée') return false;
      const dateField = a.sent_at || a.created_at;
      return Boolean(dateField && getZurichDateString(dateField) === todayZurichStr);
    }).length;

    const remainingDailyQuota = Math.max(0, dailyQuota - todayZurichCount);
    const cycleCapacity = force ? maxPerCycle : Math.min(remainingDailyQuota, maxPerCycle);

    // Si le quota journalier est atteint en exécution automatique, on s'arrête proprement sans polluer les logs
    if (cycleCapacity === 0 && !force) {
      nextRunTimestamp = new Date(Date.now() + settings.interval_minutes * 60 * 1000).toISOString();
      return {
        timestamp: startTimeIso,
        duration_ms: Date.now() - startMs,
        sources_queried: [],
        jobs_scraped_count: 0,
        jobs_new_saved: 0,
        jobs_evaluated_count: 0,
        selected_count: 0,
        prepared_count: 0,
        submitted_simulated_count: 0,
        blocked_count: 0,
        needs_review_count: 0,
        items: []
      };
    }

    console.log(`[AutonomousPipeline] Début de cycle. Date Zurich : ${todayZurichStr}. Quota civil restant : ${remainingDailyQuota} / ${dailyQuota} (max par cycle: ${maxPerCycle}).`);

    // Verify CV file presence dynamically
    const cvInfo = resolveCvFile(profile, context.dataDir);

    // Read cart items and current jobs (the pipeline ONLY processes jobs present in the cart)
    const cartItems: any[] = context.readTable('cart') || [];
    const currentJobs: Job[] = context.readTable('jobs') || [];
    const jobsEvaluatedCount = cartItems.length;

    const candidateJobs: Job[] = [];
    for (const item of cartItems) {
      const jobIdStr = String(item.job_id || item.id);
      const matchedJob = currentJobs.find(j => String(j.id) === jobIdStr);
      if (matchedJob) {
        candidateJobs.push(matchedJob);
      } else {
        candidateJobs.push({
          id: item.job_id || item.id,
          title: item.title || 'Poste',
          company: item.company || 'Entreprise',
          location: item.location,
          canton: item.canton,
          url: item.url,
          workload: item.workload,
          source: item.source,
          description: item.description || `${item.title || 'Poste'} chez ${item.company || 'Entreprise'}`,
          status: item.last_cart_status || 'en_attente'
        } as Job);
      }
    }

    let processedInThisCycle = 0;

    for (const job of candidateJobs) {
      if (processedInThisCycle >= cycleCapacity && !force) {
        break;
      }

      const evalResult = evaluateJobEligibility(job, profile, settings, existingApps);

      if (evalResult.status === 'À vérifier') {
        needsReviewCount++;
        reportItems.push({
          job_id: job.id,
          title: job.title,
          company: job.company,
          canton: job.canton,
          score: job.score || 0,
          status: 'À vérifier',
          reason: evalResult.reason
        });

        const exists = existingApps.some(a => a.job_id === job.id);
        if (!exists) {
          const checkApp: Application = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            job_id: job.id,
            status: 'À vérifier',
            cover_letter: '',
            cv_filename: cvInfo.filename || 'Non configuré',
            notes: evalResult.reason,
            created_at: new Date().toISOString(),
            title: job.title,
            company: job.company,
            location: job.location,
            canton: job.canton,
            url: job.url,
            source: job.source,
            blocked_reason: evalResult.reason
          };
          existingApps.unshift(checkApp);
          await context.writeTable('applications', existingApps);
        }
        continue;
      }

      if (!evalResult.isEligible) {
        blockedCount++;
        continue;
      }

      // Check CV presence on disk: if CV missing, cannot prepare candidate -> set status 'À vérifier'
      if (!cvInfo.exists) {
        needsReviewCount++;
        const cvBlockReason = cvInfo.errorReason || 'CV configuré introuvable sur le disque.';
        reportItems.push({
          job_id: job.id,
          title: job.title,
          company: job.company,
          canton: job.canton,
          score: job.score || 0,
          status: 'À vérifier',
          reason: cvBlockReason
        });

        const exists = existingApps.some(a => a.job_id === job.id);
        if (!exists) {
          const cvMissingApp: Application = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            job_id: job.id,
            status: 'À vérifier',
            cover_letter: '',
            cv_filename: cvInfo.filename || 'Introuvable',
            notes: cvBlockReason,
            created_at: new Date().toISOString(),
            title: job.title,
            company: job.company,
            location: job.location,
            canton: job.canton,
            url: job.url,
            source: job.source,
            blocked_reason: cvBlockReason
          };
          existingApps.unshift(cvMissingApp);
          await context.writeTable('applications', existingApps);
        }
        continue;
      }

      // Job is fully eligible: proceed through autonomous steps
      selectedCount++;
      const channelInfo = detectJobChannel(job);

      // Preparation step
      preparedCount++;
      const letter = generateTailoredLetter(job, profile);

      // Simulation submission step: distinct status 'Simulé', internal audit reference
      const proofRef = `SIM-CH-${todayZurichStr.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const submissionProof: SubmissionProof = {
        mode: 'simulation',
        is_simulation: true,
        channel: channelInfo.channel,
        target: channelInfo.target,
        reference: proofRef,
        timestamp: new Date().toISOString(),
        simulation_date_zurich: formatZurichDateTime(new Date()),
        documents: [cvInfo.filename, `Lettre_${(job.company || 'Candidature').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`],
        summary: `Simulation de dépôt validée via le canal ${channelInfo.channel} (${channelInfo.target}). Dossier complet et vérifié.`,
        disclaimer: `Trace d'audit de simulation interne - Aucun envoi réel effectué`,
        notes: `Validation en mode simulation : aucun envoi réel ni transmission externe.`
      };

      const newApplication: Application = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        job_id: job.id,
        status: 'Simulé', // Distinct status 'Simulé' as requested
        is_simulated: true,
        cover_letter: letter,
        cv_filename: cvInfo.filename,
        notes: `[SIMULATION AUDIT] Réf: ${proofRef}\nCanal ciblé: ${channelInfo.channel} (${channelInfo.target})\nCV vérifié: ${cvInfo.filename}\nLettre: Rédigée sur données réelles.\nAucun envoi réel effectué.`,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        title: job.title,
        company: job.company,
        location: job.location,
        canton: job.canton,
        url: job.url,
        source: job.source,
        channel: channelInfo.channel,
        channel_target: channelInfo.target,
        selection_reason: evalResult.reason,
        submission_proof: submissionProof
      };

      existingApps.unshift(newApplication);
      await context.writeTable('applications', existingApps);

      // Update job status in jobs table to 'Simulé'
      await context.mutateTable('jobs', (allJobs) => {
        const jIdx = allJobs.findIndex((j: any) => j.id === job.id);
        if (jIdx !== -1) {
          allJobs[jIdx].status = 'Simulé';
        }
        return allJobs;
      });

      submittedCount++;
      processedInThisCycle++;

      reportItems.push({
        job_id: job.id,
        title: job.title,
        company: job.company,
        canton: job.canton,
        score: job.score || 0,
        status: 'Simulé',
        reason: evalResult.reason,
        channel: `${channelInfo.channel}: ${channelInfo.target}`,
        proof_ref: proofRef
      });
    }

    const durationMs = Date.now() - startMs;
    consecutiveErrors = 0;

    const report: PipelineRunReport = {
      timestamp: startTimeIso,
      duration_ms: durationMs,
      sources_queried: sourcesQueried,
      jobs_scraped_count: jobsScrapedCount,
      jobs_new_saved: jobsNewSaved,
      jobs_evaluated_count: jobsEvaluatedCount,
      selected_count: selectedCount,
      prepared_count: preparedCount,
      submitted_simulated_count: submittedCount,
      blocked_count: blockedCount,
      needs_review_count: needsReviewCount,
      items: reportItems
    };

    lastReport = report;

    // Persist report in simulation_reports.json
    try {
      const reportsPath = path.join(context.dataDir, 'simulation_reports.json');
      let history: any[] = [];
      if (fs.existsSync(reportsPath)) {
        try { history = JSON.parse(fs.readFileSync(reportsPath, 'utf-8')); } catch (e) { history = []; }
      }
      history.unshift(report);
      fs.writeFileSync(reportsPath, JSON.stringify(history.slice(0, 20), null, 2));
    } catch (e) {
      console.warn('Impossible de persister simulation_reports.json:', e);
    }

    // Add log ONLY if at least 1 job was processed / submitted
    if (submittedCount > 0) {
      const logs = context.readTable('scraping_logs');
      logs.unshift({
        id: Date.now(),
        source: 'pipeline_autonome',
        level: 'info',
        message: `Cycle autonome (Simulation) terminé en ${(durationMs / 1000).toFixed(1)}s [Jour civil Zurich ${todayZurichStr}] : ${selectedCount} sélectionnée(s), ${submittedCount} candidature(s) simulée(s), ${needsReviewCount} à vérifier, ${blockedCount} non retenue(s).`,
        timestamp: startTimeIso
      });
      await context.writeTable('scraping_logs', logs.slice(0, 100));
    }

    // Calculate next run timestamp
    nextRunTimestamp = new Date(Date.now() + settings.interval_minutes * 60 * 1000).toISOString();

    return report;
  } catch (err: any) {
    consecutiveErrors++;
    console.error('[AutonomousPipeline] Échec du cycle autonome :', err);
    throw err;
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Returns latest simulation report
 */
export function getSimulationReport(): PipelineRunReport | null {
  if (lastReport) return lastReport;
  if (!context) return null;

  try {
    const reportsPath = path.join(context.dataDir, 'simulation_reports.json');
    if (fs.existsSync(reportsPath)) {
      const history = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'));
      if (Array.isArray(history) && history.length > 0) {
        lastReport = history[0];
        return lastReport;
      }
    }
  } catch (e) {}

  return null;
}
