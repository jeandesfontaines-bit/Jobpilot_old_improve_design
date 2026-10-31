/**
 * Moteur de stockage SQLite haute performance pour JobPilot Suisse.
 * Utilise 'bun:sqlite' nativement sous Bun (avec fallback gracieux).
 * 100% gratuit, local, sécurisé et conforme ACID.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const DATA_DIR = process.env.JOBPILOT_DATA_DIR || path.join(PROJECT_ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'jobpilot.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let dbInstance: any = null;

export function getDatabase(): any {
  if (!dbInstance) {
    try {
      // 1. Détection de bun:sqlite natif
      // @ts-ignore
      const { Database } = require('bun:sqlite');
      dbInstance = new Database(DB_PATH);
      dbInstance.exec('PRAGMA journal_mode = WAL;');
      dbInstance.exec('PRAGMA synchronous = NORMAL;');
      setupSchema(dbInstance);
      migrateJsonIfEmpty(dbInstance);
    } catch (e: any) {
      console.warn('[SQLite] Bun SQLite non disponible, utilisation du stockage JSON persistant natif :', e.message);
      return null;
    }
  }
  return dbInstance;
}

function setupSchema(db: any): void {
  db.exec(`
    -- Table structurée des offres d'emploi
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      source TEXT,
      title TEXT,
      company TEXT,
      location TEXT,
      canton TEXT,
      contract_type TEXT,
      workload TEXT,
      remote INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Nouvelle',
      is_new INTEGER DEFAULT 1,
      published_at TEXT,
      discovered_at TEXT,
      url TEXT,
      description TEXT,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_canton ON jobs(canton);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_url ON jobs(url);
    CREATE INDEX IF NOT EXISTS idx_jobs_ext ON jobs(external_id);

    -- Table structurée des candidatures
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      status TEXT DEFAULT 'Brouillon',
      cover_letter TEXT,
      cv_filename TEXT,
      created_at TEXT,
      sent_at TEXT,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_apps_job_id ON applications(job_id);
    CREATE INDEX IF NOT EXISTS idx_apps_status ON applications(status);

    -- Table clé-valeur pour documents et tables annexes (user_profile, settings, sources, scraping_logs, etc.)
    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Migration automatique : Si SQLite est vierge, injecte les données des anciens .json
 */
function migrateJsonIfEmpty(db: any): void {
  try {
    const jobsCountRow = db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };
    const jobsCount = jobsCountRow ? jobsCountRow.count : 0;
    const jobsJsonPath = path.join(DATA_DIR, 'jobs.json');

    if (jobsCount === 0 && fs.existsSync(jobsJsonPath)) {
      const raw = fs.readFileSync(jobsJsonPath, 'utf-8');
      const jobs = JSON.parse(raw);
      if (Array.isArray(jobs) && jobs.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO jobs (
            id, external_id, source, title, company, location, canton, contract_type,
            workload, remote, score, status, is_new, published_at, discovered_at, url, description, data
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `);

        const insertMany = db.transaction((rows: any[]) => {
          for (const j of rows) {
            insert.run(
              String(j.id ?? Date.now() + Math.random()),
              j.external_id != null ? String(j.external_id) : null,
              j.source != null ? String(j.source) : 'jobs_ch',
              j.title != null ? String(j.title) : '',
              j.company != null ? String(j.company) : '',
              j.location != null ? String(j.location) : '',
              j.canton != null ? String(j.canton) : '',
              j.contract_type != null ? String(j.contract_type) : '',
              j.workload != null ? String(j.workload) : '',
              j.remote ? 1 : 0,
              Number(j.score || 0),
              j.status != null ? String(j.status) : 'Nouvelle',
              j.is_new ? 1 : 0,
              j.published_at != null ? String(j.published_at) : new Date().toISOString(),
              j.discovered_at != null ? String(j.discovered_at) : new Date().toISOString(),
              j.url != null ? String(j.url) : '',
              j.description != null ? String(j.description) : '',
              JSON.stringify(j)
            );
          }
        });

        insertMany(jobs);
        console.log(`[SQLite] Migration réussie : ${jobs.length} offres importées dans jobpilot.db`);
      }
    }
  } catch (e: any) {
    console.warn('[SQLite] Note migration jobs :', e.message);
  }

  // Migration des autres tables vers documents
  try {
    const docTables = ['user_profile', 'settings', 'sources', 'scraping_logs', 'scraping_tasks', 'applications', 'cart'];
    const insertDoc = db.prepare('INSERT OR IGNORE INTO documents (key, data) VALUES (?, ?)');

    for (const table of docTables) {
      const jsonPath = path.join(DATA_DIR, `${table}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          const content = fs.readFileSync(jsonPath, 'utf-8');
          if (content && content.trim().length > 0) {
            insertDoc.run(table, content);
          }
        } catch (e) {}
      }
    }
  } catch (e: any) {}
}

/**
 * Lecture d'une table dans SQLite.
 */
export function sqliteReadTable(table: string): any[] | null {
  const db = getDatabase();
  if (!db) return null;

  try {
    if (table === 'jobs') {
      const rows = db.prepare('SELECT data FROM jobs ORDER BY score DESC, published_at DESC').all() as { data: string }[];
      return rows.map(r => {
        try {
          return JSON.parse(r.data);
        } catch {
          return null;
        }
      }).filter(Boolean);
    }

    const doc = db.prepare('SELECT data FROM documents WHERE key = ?').get(table) as { data: string } | undefined;
    if (!doc) return null;

    return JSON.parse(doc.data);
  } catch (err: any) {
    return null;
  }
}

/**
 * Écriture sécurisée avec transaction ACID dans SQLite.
 */
export function sqliteWriteTable(table: string, data: any[]): boolean {
  const db = getDatabase();
  if (!db) return false;

  try {
    if (table === 'jobs') {
      const deleteExisting = db.prepare('DELETE FROM jobs');
      const insert = db.prepare(`
        INSERT OR REPLACE INTO jobs (
          id, external_id, source, title, company, location, canton, contract_type,
          workload, remote, score, status, is_new, published_at, discovered_at, url, description, data
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);

      const tx = db.transaction((rows: any[]) => {
        deleteExisting.run();
        for (const j of rows) {
          insert.run(
            String(j.id ?? Date.now() + Math.random()),
            j.external_id != null ? String(j.external_id) : null,
            j.source != null ? String(j.source) : 'jobs_ch',
            j.title != null ? String(j.title) : '',
            j.company != null ? String(j.company) : '',
            j.location != null ? String(j.location) : '',
            j.canton != null ? String(j.canton) : '',
            j.contract_type != null ? String(j.contract_type) : '',
            j.workload != null ? String(j.workload) : '',
            j.remote ? 1 : 0,
            Number(j.score || 0),
            j.status != null ? String(j.status) : 'Nouvelle',
            j.is_new ? 1 : 0,
            j.published_at != null ? String(j.published_at) : new Date().toISOString(),
            j.discovered_at != null ? String(j.discovered_at) : new Date().toISOString(),
            j.url != null ? String(j.url) : '',
            j.description != null ? String(j.description) : '',
            JSON.stringify(j)
          );
        }
      });

      tx(data);
      return true;
    }

    db.prepare('INSERT OR REPLACE INTO documents (key, data, updated_at) VALUES (?, ?, datetime(\'now\'))')
      .run(table, JSON.stringify(data));
    return true;
  } catch (err: any) {
    console.error(`[SQLite] Erreur écriture table ${table} :`, err.message);
    return false;
  }
}
