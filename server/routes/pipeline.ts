/**
 * Routes Pipeline autonome — statut, toggle, run-now, simulation report.
 */
import { Router } from 'express';
import {
  getPipelineStatus,
  togglePipeline,
  runAutonomousCycle,
  getSimulationReport
} from '../../src/services/autonomousPipeline.ts';

const router = Router();

router.get('/api/pipeline/status', (req, res) => {
  try {
    const status = getPipelineStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pipeline/toggle', async (req, res) => {
  try {
    const { active } = req.body;
    const status = await togglePipeline(active);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/pipeline/run-now', async (req, res) => {
  try {
    const report = await runAutonomousCycle(true);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/pipeline/simulation-report', (req, res) => {
  try {
    const report = getSimulationReport();
    res.json(report || { message: 'Aucun cycle de simulation exécuté pour l\'instant.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
