/**
 * Routes Dashboard — statistiques et résumé.
 */
import { Router } from 'express';
import { readTable } from '../db.ts';
import { evaluateJobFilters } from '../../src/services/jobFilterEngine.ts';

const router = Router();

// Dashboard summary & statistics
router.get('/api/dashboard', (req, res) => {
  const jobs = readTable('jobs');
  const sources = readTable('sources');
  const profile = readTable('user_profile')[0] || {};
  const excludedRoles = Array.isArray(profile.excluded_roles) ? profile.excluded_roles : [];

  const activeJobs = jobs.filter((j: any) => !evaluateJobFilters(j, profile).isExcluded);
  const excludedCount = jobs.length - activeJobs.length;

  const stats = {
    total: activeJobs.length,
    new: activeJobs.filter((j: any) => j.status === 'Nouvelle').length,
    to_apply: activeJobs.filter((j: any) => j.status === 'À postuler').length,
    sent: activeJobs.filter((j: any) => j.status === 'Envoyée').length,
    excluded: excludedCount
  };

  const topJobs = [...activeJobs].sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).slice(0, 10);

  res.json({
    stats,
    top_jobs: topJobs,
    sources
  });
});

// Lightweight jobs counts endpoint for instant statistics
router.get('/api/jobs/counts', (req, res) => {
  try {
    const jobs = readTable('jobs');
    const profile = readTable('user_profile')[0] || {};

    let retained = 0;
    let excluded = 0;
    let newOnes = 0;

    for (const j of jobs) {
      const isExcl = evaluateJobFilters(j, profile).isExcluded;
      if (isExcl) {
        excluded++;
      } else {
        retained++;
        if (j.status === 'Nouvelle') newOnes++;
      }
    }

    res.json({
      retained,
      excluded,
      new_ones: newOnes,
      total: jobs.length
    });
  } catch (err: any) {
    console.error('Error in /api/jobs/counts:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
