import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { DATA_DIR, UPLOADS_DIR, readTable, writeTable, mutateTable, initData } from './server/db.ts';
import { initAutonomousPipeline } from './src/services/autonomousPipeline.ts';
import { checkAuthEnv, authGate, registerAuthRoutes } from './server/services/authService.ts';

// Assurance de la présence des dossiers data/ et uploads/
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Vérification de la configuration d'authentification (APP_PASSWORD obligatoire en production)
checkAuthEnv();

// Routes modulaires
import dashboardRouter from './server/routes/dashboard.ts';
import jobsRouter from './server/routes/jobs.ts';
import scrapingRouter from './server/routes/scraping.ts';
import profileRouter from './server/routes/profile.ts';
import settingsRouter from './server/routes/settings.ts';
import applicationsRouter from './server/routes/applications.ts';
import aiRouter from './server/routes/ai.ts';
import pipelineRouter from './server/routes/pipeline.ts';
import cvsRouter from './server/routes/cvs.ts';
import cartRouter from './server/routes/cart.ts';
import gmailRouter from './server/routes/gmail.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const portArgIdx = process.argv.indexOf('--port');
const cliPort = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? Number(process.argv[portArgIdx + 1]) : null;
const PORT = cliPort || (process.env.NODE_ENV === 'production' ? (process.env.PORT || 8080) : (process.env.PORT || 3000));

// Middlewares globaux
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Initialisation du stockage persistant JSON
initData();

// Authentification (production uniquement) : routes publiques /login et /logout, puis verrou global
registerAuthRoutes(app);
app.use(authGate);

// Enregistrement des routes API
app.use(dashboardRouter);
app.use(jobsRouter);
app.use(scrapingRouter);
app.use(profileRouter);
app.use(settingsRouter);
app.use(applicationsRouter);
app.use(aiRouter);
app.use(pipelineRouter);
app.use(cvsRouter);
app.use(cartRouter);
app.use(gmailRouter);

// Démarrage du serveur et configuration Vite
async function startServer() {
  initAutonomousPipeline({
    dataDir: DATA_DIR,
    readTable: (table: string) => readTable(table as any),
    writeTable: (table: string, data: any[]) => writeTable(table as any, data),
    mutateTable: (table: string, mutator: (data: any[]) => any[]) => mutateTable(table as any, mutator)
  });

  if (process.env.NODE_ENV !== 'production' && process.env.JOBPILOT_SKIP_VITE !== '1' && process.env.JOBPILOT_SKIP_VITE !== 'true') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa'
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`JobPilot Suisse server running on http://localhost:${PORT}`);
  });
}

startServer();
