/**
 * Routes Paramètres — Configuration du scoring, options & tests Ollama.
 */
import { Router } from 'express';
import axios from 'axios';
import { readTable, writeTable, mutateTable } from '../db.ts';
import { migrateSettings } from '../../src/services/autonomousPipeline.ts';
import { calculateJobScore } from '../../src/services/swissJobHelpers.ts';
import { ollamaCloud } from '../../src/services/ollamaCloudClient.ts';

const router = Router();

// 5. Settings & Scoring Weights
router.get('/api/settings', (req, res) => {
  const current = readTable('settings')[0] || {};
  res.json(migrateSettings(current));
});

router.put('/api/settings', async (req, res) => {
  const migrated = migrateSettings(req.body);
  await writeTable('settings', [migrated]);
  const profile = readTable('user_profile')[0] || {};
  await mutateTable('jobs', (currentJobs) => {
    return currentJobs.map((job: any) => ({
      ...job,
      score: calculateJobScore(job, profile, migrated)
    }));
  });

  res.json({ success: true, settings: migrated });
});

// Ollama test connection (Cloud cluster or local)
router.post('/api/settings/test-ollama', async (req, res) => {
  const { ollama_url } = req.body;

  if (ollamaCloud.hasKeys()) {
    try {
      const activeKey = (process.env.OLLAMA_API_KEYS || '').split(',')[0]?.trim();
      const response = await axios.get('https://ollama.com/api/tags', {
        headers: { Authorization: `Bearer ${activeKey}` },
        timeout: 5000
      });
      const models = (response.data.models || []).map((m: any) => m.name || m.model);
      return res.json({
        success: true,
        cloud: true,
        keysConfigured: ollamaCloud.getKeyCount(),
        message: `Connecté à Ollama Cloud avec ${ollamaCloud.getKeyCount()} clé(s) en rotation`,
        models
      });
    } catch (err: any) {
      console.warn('[Ollama Cloud Test] Erreur cloud tags:', err.message);
    }
  }

  try {
    const response = await axios.get(`${ollama_url || 'http://localhost:11434'}/api/tags`, { timeout: 3000 });
    res.json({ success: true, cloud: false, models: response.data.models || [] });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Impossible de joindre Ollama' });
  }
});

export default router;
