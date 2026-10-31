/**
 * Couche de persistance JSON — stockage local dans data/.
 * Ce module est le point d'accès unique pour lire/écrire dans les fichiers JSON.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sqliteReadTable, sqliteWriteTable, getDatabase } from './storage/sqlite.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.JOBPILOT_DATA_DIR || path.join(PROJECT_ROOT, 'data');
export const UPLOADS_DIR = process.env.JOBPILOT_UPLOADS_DIR || path.join(PROJECT_ROOT, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const DB_FILES = {
  jobs: path.join(DATA_DIR, 'jobs.json'),
  sources: path.join(DATA_DIR, 'sources.json'),
  applications: path.join(DATA_DIR, 'applications.json'),
  user_profile: path.join(DATA_DIR, 'user_profile.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  scraping_logs: path.join(DATA_DIR, 'scraping_logs.json'),
  scraping_tasks: path.join(DATA_DIR, 'scraping_tasks.json'),
  cv_variants: path.join(DATA_DIR, 'cv_variants.json'),
  cart: path.join(DATA_DIR, 'cart.json'),
} as const;

export type TableName = keyof typeof DB_FILES;

export const readTable = (table: TableName): any[] => {
  try {
    const sqliteData = sqliteReadTable(table);
    if (Array.isArray(sqliteData) && sqliteData.length > 0) {
      return sqliteData;
    }
  } catch (e) {
    // Repli vers lecture JSON si SQLite indisponible
  }

  if (!fs.existsSync(DB_FILES[table])) return [];
  try {
    const content = fs.readFileSync(DB_FILES[table], 'utf-8');
    return content ? JSON.parse(content) : [];
  } catch (e) {
    console.error(`Error reading ${DB_FILES[table]}:`, e);
    return [];
  }
};

let writeQueue = Promise.resolve();

export const mutateTable = async (
  table: TableName,
  mutator: (currentData: any[]) => any[],
  queuedDelayMs = 0
): Promise<{ success: boolean; data: any[] }> => {
  return new Promise((resolve) => {
    writeQueue = writeQueue.then(async () => {
      try {
        if (queuedDelayMs > 0) {
          await new Promise((r) => setTimeout(r, queuedDelayMs));
        }
        const isTestMode = process.env.NODE_ENV === 'test' || fs.existsSync(path.join(DATA_DIR, '.test-mode'));
        if (isTestMode && (process.env.JOBPILOT_SIMULATE_WRITE_FAILURE === '1' || fs.existsSync(path.join(DATA_DIR, '.simulate-write-failure')))) {
          throw new Error('Échec simulé d\'écriture sur le stockage persistant');
        }
        const currentData = readTable(table);
        const updatedData = mutator(currentData);

        // 1. Écriture immédiate dans SQLite (transaction ACID)
        try {
          sqliteWriteTable(table, updatedData);
        } catch (sqlErr: any) {
          console.warn('[SQLite] Erreur écriture :', sqlErr.message);
        }

        // 2. Écriture miroir JSON atomique (.tmp -> renameSync) pour persistance et tests
        const targetPath = DB_FILES[table];
        const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(updatedData, null, 2), 'utf-8');
        fs.renameSync(tempPath, targetPath);

        resolve({ success: true, data: updatedData });
      } catch (e) {
        console.error(`Error mutating ${DB_FILES[table]}:`, e);
        resolve({ success: false, data: [] });
      }
    });
  });
};

export const writeTable = async (
  table: TableName,
  data: any[],
  queuedDelayMs = 0
): Promise<boolean> => {
  const res = await mutateTable(table, () => data, queuedDelayMs);
  return res.success;
};

// Initial Data Bootstrapping
export function initData(): void {
  // Initialise SQLite au démarrage
  try {
    getDatabase();
  } catch (e: any) {
    console.warn('[Storage] Initialisation SQLite :', e.message);
  }
  const defaultSources = [
    { name: 'jobs_ch', display_name: 'jobs.ch', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'jobup_ch', display_name: 'jobup.ch (Suisse romande)', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'job_room', display_name: 'Job-Room (Service public)', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'linkedin', display_name: 'LinkedIn', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'indeed_ch', display_name: 'Indeed Suisse', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'jobwinner', display_name: 'JobWinner', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'jobeo', display_name: 'Jobeo', status: 'actif', last_run: null, found_count: 0, new_count: 0 },
    { name: 'jobscout24', display_name: 'JobScout24 (connecteur indisponible)', status: 'inactif', last_run: null, found_count: 0, new_count: 0 }
  ];
  const existingSources = fs.existsSync(DB_FILES.sources) ? readTable('sources') : [];
  const existingNames = new Set(existingSources.map((source: any) => source.name));
  const mergedSources = [
    ...existingSources,
    ...defaultSources.filter((source) => !existingNames.has(source.name))
  ];
  if (!fs.existsSync(DB_FILES.sources) || mergedSources.length !== existingSources.length) {
    void writeTable('sources', mergedSources);
  }

  if (!fs.existsSync(DB_FILES.user_profile)) {
    writeTable('user_profile', [{}]);
  }

  if (!fs.existsSync(DB_FILES.settings)) {
    const defaultSettings = {
      scheduler_active: false,
      scheduler_mode: 'simulation',
      simulation_mode: true,
      interval_minutes: 60,
      auto_scrape_interval: 0,
      max_candidates_per_cycle: 2,
      daily_submission_quota: 5,
      daily_application_limit: 5
    };
    writeTable('settings', [defaultSettings]);
  }

  if (!fs.existsSync(DB_FILES.jobs)) {
    writeTable('jobs', []);
  }

  if (!fs.existsSync(DB_FILES.applications)) {
    writeTable('applications', []);
  }

  if (!fs.existsSync(DB_FILES.scraping_logs)) {
    writeTable('scraping_logs', [
      {
        id: Date.now(),
        source: 'system',
        level: 'info',
        message: 'Initialisation du système de stockage persistant JobPilot Suisse.',
        timestamp: new Date().toISOString()
      }
    ]);
  }

  if (!fs.existsSync(DB_FILES.scraping_tasks)) {
    writeTable('scraping_tasks', []);
  }

  if (!fs.existsSync(DB_FILES.cv_variants)) {
    writeTable('cv_variants', []);
  }

  if (!fs.existsSync(DB_FILES.cart)) {
    writeTable('cart', []);
  }
}
