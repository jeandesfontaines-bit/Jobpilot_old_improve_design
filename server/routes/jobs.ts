/**
 * Routes Offres d'emploi — Liste, filtrage, statuts, adaptation CV et postulation Playwright.
 */
import { Router } from 'express';
import { readTable, mutateTable } from '../db.ts';
import { checkJobExclusions } from '../../src/services/exclusionMatcher.ts';
import { evaluateJobFilters } from '../../src/services/jobFilterEngine.ts';
import { generateTailoredCv, runPlaywrightApplication } from '../../src/services/automationAgent.ts';
import { applyToJob } from '../services/applicationEngine.ts';

const router = Router();

// 2. Jobs list with filtering, search and reversible title exclusions
router.get('/api/jobs', (req, res) => {
  const { search, canton, status, source, min_score, remote, sort, view, only_excluded, include_excluded } = req.query;
  let jobs = readTable('jobs');
  const profile = readTable('user_profile')[0] || {};
  const excludedRoles = Array.isArray(profile.excluded_roles) ? profile.excluded_roles : [];

  // Annotate all jobs with their exclusion status based on Section 2 rules
  jobs = jobs.map((j: any) => {
    const evalRes = evaluateJobFilters(j, profile);
    return {
      ...j,
      is_excluded: evalRes.isExcluded,
      exclusion_reason: evalRes.primaryReason,
      exclusion_reasons: evalRes.reasons,
      matched_exclusions: evalRes.matchedExclusions,
      is_canton_unknown: evalRes.isCantonUnknown,
    };
  });

  // Filter based on view parameter:
  // - 'excluded' or only_excluded=true: only returns excluded jobs
  // - 'active': only returns non-excluded jobs
  // - 'all' or include_excluded=true: returns all jobs annotated
  // - default: returns only non-excluded jobs (hiding excluded ones reversibly)
  if (view === 'excluded' || only_excluded === 'true') {
    jobs = jobs.filter((j: any) => j.is_excluded);
  } else if (view === 'all' || include_excluded === 'true') {
    // Keep both, annotated
  } else {
    // Default or view === 'active': hide excluded jobs
    jobs = jobs.filter((j: any) => !j.is_excluded);
  }

  if (search) {
    const term = (search as string).toLowerCase();
    jobs = jobs.filter((j: any) =>
      (j.title || '').toLowerCase().includes(term) ||
      (j.company || '').toLowerCase().includes(term) ||
      (j.description || '').toLowerCase().includes(term)
    );
  }
  if (canton && canton !== 'ALL') jobs = jobs.filter((j: any) => j.canton === canton);
  if (status && status !== 'ALL') jobs = jobs.filter((j: any) => j.status === status);
  if (source && source !== 'ALL') jobs = jobs.filter((j: any) => j.source === source);
  if (min_score) jobs = jobs.filter((j: any) => (j.score || 0) >= Number(min_score));
  if (remote === 'true') jobs = jobs.filter((j: any) => j.remote);

  if (sort === 'score_desc') jobs.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
  else if (sort === 'date_desc') jobs.sort((a: any, b: any) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime());
  else if (sort === 'company_asc') jobs.sort((a: any, b: any) => (a.company || '').localeCompare(b.company || ''));
  else jobs.sort((a: any, b: any) => (b.score || 0) - (a.score || 0));

  res.json(jobs);
});

// Update Job Status
router.patch('/api/jobs/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  let targetJob: any = null;

  const mutateRes = await mutateTable('jobs', (currentJobs) => {
    const jobIndex = currentJobs.findIndex((j: any) => String(j.id) === String(id));
    if (jobIndex === -1) return currentJobs;
    currentJobs[jobIndex] = {
      ...currentJobs[jobIndex],
      status,
      is_new: 0
    };
    targetJob = { ...currentJobs[jobIndex] };
    return currentJobs;
  });

  if (!targetJob) {
    return res.status(404).json({ error: 'Offre non trouvée' });
  }
  if (!mutateRes.success) {
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de l’offre' });
  }

  if (status === 'À postuler') {
    await mutateTable('applications', (currentApps) => {
      if (!currentApps.find((a: any) => String(a.job_id) === String(id))) {
        const profile = readTable('user_profile')[0] || {};
        const newApp = {
          id: Date.now(),
          job_id: targetJob.id,
          status: 'Brouillon',
          cover_letter: `Madame, Monsieur,\n\nC'est avec grand intérêt que j'ai découvert votre offre pour le poste de ${targetJob.title} chez ${targetJob.company}.\n\nFort de mon parcours en tant que ${profile.wanted_roles?.[0] || 'Développeur Full Stack'} et maîtrisant ${profile.skills?.slice(0, 4).join(', ') || 'les technologies web'}, je suis convaincu de pouvoir contribuer efficacement à vos projets.\n\nJe me tiens à votre entière disposition pour un entretien.\n\nBien cordialement,\n${profile.first_name || ''} ${profile.last_name || ''}`,
          cv_filename: profile.cv_filename || 'CV.pdf',
          created_at: new Date().toISOString()
        };
        return [newApp, ...currentApps];
      }
      return currentApps;
    });
  }

  res.json({ success: true, job: targetJob });
});

// Tailor CV for a specific job
router.post('/api/jobs/:id/tailor-cv', async (req, res) => {
  const { id } = req.params;
  const jobs = readTable('jobs');
  const job = jobs.find((j: any) => String(j.id) === String(id));
  if (!job) return res.status(404).json({ error: 'Offre non trouvée' });

  const profile = readTable('user_profile')[0] || {};
  const tailored = await generateTailoredCv(job, profile);

  await mutateTable('jobs', (currentJobs) => {
    return currentJobs.map((j: any) => {
      if (String(j.id) === String(id)) {
        return {
          ...j,
          recommended_cv_id: tailored.recommendedCvId,
          adaptation_reason: tailored.adaptationReason,
          tailored_cv_filename: tailored.tailoredCvFilename,
          tailored_cv_path: tailored.tailoredCvPath,
        };
      }
      return j;
    });
  });

  res.json({
    success: true,
    recommended_cv_id: tailored.recommendedCvId,
    adaptation_reason: tailored.adaptationReason,
    tailored_cv_filename: tailored.tailoredCvFilename,
    tailored_cv_path: tailored.tailoredCvPath,
  });
});

// Run Playwright auto-apply for a specific job (utilisant le moteur centralisé applyToJob)
router.post('/api/jobs/:id/auto-apply', async (req, res) => {
  const { id } = req.params;
  const headless = req.body?.headless !== undefined
    ? Boolean(req.body.headless)
    : (req.body?.options?.headless !== undefined ? Boolean(req.body.options.headless) : true);
  const simulate = req.body?.simulate !== undefined
    ? Boolean(req.body.simulate)
    : (req.body?.options?.simulate !== undefined ? Boolean(req.body.options.simulate) : false);
  const force_resubmit = req.body?.force_resubmit !== undefined
    ? Boolean(req.body.force_resubmit)
    : (req.body?.options?.force_resubmit !== undefined ? Boolean(req.body.options.force_resubmit) : false);

  const result = await applyToJob(id, { headless, simulate, force_resubmit });

  if (result.refused) {
    return res.status(400).json({
      success: false,
      refused: true,
      submitted_unconfirmed: result.submitted_unconfirmed,
      error: result.error,
      automation_result: result.automation_result,
      display_status: result.display_status,
      display_label: result.display_label
    });
  }

  if (!result.success && result.error && !result.automation_result) {
    return res.status(404).json({ error: result.error });
  }

  res.json({
    success: result.success,
    simulated: result.simulated,
    error: result.error,
    automation_result: result.automation_result,
    display_status: result.display_status,
    display_label: result.display_label,
    recommended_cv_id: result.recommended_cv_id,
    adaptation_reason: result.adaptation_reason,
    tailored_cv_filename: result.tailored_cv_filename,
    tailored_cv_path: result.tailored_cv_path,
  });
});

export default router;
