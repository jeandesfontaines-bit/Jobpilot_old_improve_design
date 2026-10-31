/**
 * Routes Candidatures — Suivi et mise à jour des statuts de candidature.
 */
import { Router } from 'express';
import { readTable, mutateTable } from '../db.ts';

const router = Router();

// 6. Applications Management
router.get('/api/applications', (req, res) => {
  try {
    let applications = readTable('applications');
    if (!Array.isArray(applications)) {
      applications = [];
    }
    let jobs = readTable('jobs');
    if (!Array.isArray(jobs)) {
      jobs = [];
    }

    // Enrich with job title and company if not present
    const enriched = applications.map((app: any) => {
      const job = jobs.find((j: any) => String(j.id) === String(app.job_id));
      return {
        ...app,
        title: app.title || job?.title,
        company: app.company || job?.company,
        location: app.location || job?.location,
        canton: app.canton || job?.canton,
        url: app.url || job?.url,
        source: app.source || job?.source
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('Erreur dans GET /api/applications:', err);
    res.json([]);
  }
});

router.patch('/api/applications/:id', async (req, res) => {
  const { id } = req.params;
  let targetJobId: any = null;
  let targetJobStatus: any = null;

  const mutateAppRes = await mutateTable('applications', (currentApps) => {
    const appIndex = currentApps.findIndex((a: any) => String(a.id) === String(id));
    if (appIndex === -1) return currentApps;
    const updated = { ...currentApps[appIndex], ...req.body };
    if (req.body.status === 'Envoyée' || req.body.status === 'Simulé') {
      updated.sent_at = updated.sent_at || new Date().toISOString();
      targetJobId = updated.job_id;
      targetJobStatus = req.body.status;
    }
    currentApps[appIndex] = updated;
    return currentApps;
  });

  if (!mutateAppRes.success) {
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la candidature' });
  }

  if (targetJobId != null && targetJobStatus != null) {
    await mutateTable('jobs', (currentJobs) => {
      const jobIndex = currentJobs.findIndex((j: any) => String(j.id) === String(targetJobId));
      if (jobIndex !== -1) {
        currentJobs[jobIndex] = {
          ...currentJobs[jobIndex],
          status: targetJobStatus
        };
      }
      return currentJobs;
    });
  }

  res.json({ success: true });
});

router.delete('/api/applications/:id', async (req, res) => {
  const { id } = req.params;
  const mutateRes = await mutateTable('applications', (currentApps) => {
    return currentApps.filter((a: any) => String(a.id) !== String(id));
  });

  if (!mutateRes.success) {
    return res.status(500).json({ error: 'Erreur lors de la suppression de la candidature' });
  }

  res.json({ success: true });
});

router.post('/api/applications/clear-simulated', async (_req, res) => {
  let clearedCount = 0;
  const mutateRes = await mutateTable('applications', (currentApps) => {
    const kept = currentApps.filter((a: any) => {
      const isSim = a.is_simulated || a.submission_proof?.mode === 'simulation' || a.status === 'Simulé' || a.notes?.includes('simulation');
      if (isSim) clearedCount++;
      return !isSim;
    });
    return kept;
  });

  if (!mutateRes.success) {
    return res.status(500).json({ error: 'Erreur lors du nettoyage des simulations' });
  }

  res.json({ success: true, count: clearedCount });
});

export default router;
