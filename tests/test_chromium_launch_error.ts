import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { chromium } from 'playwright';

console.log('=== TEST : Échec de lancement de Chromium (Mode de secours supprimé) ===\n');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-launch-fail-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testUploadsDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;

const baseCv = path.join(testUploadsDir, 'test_cv.pdf');
fs.writeFileSync(baseCv, '%PDF-1.4\n%%EOF');

// Serveur HTTP de test : NE DOIT RECEVOIR AUCUNE REQUÊTE si le navigateur ne démarre pas
let requestsReceived = 0;
const server = http.createServer((req, res) => {
  requestsReceived++;
  res.writeHead(200);
  res.end('OK');
});

let port = 0;
await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    port = (server.address() as any).port;
    resolve();
  });
});

const job = {
  id: 888,
  title: 'Dev Test',
  company: 'Test Corp',
  url: `http://127.0.0.1:${port}/submit-url-that-should-never-be-called`
};

const profile = {
  first_name: 'Jean',
  last_name: 'Test',
  email: 'jean@test.ch',
  privacy_consent: true,
  cv_path: baseCv
};

const { runPlaywrightApplication } = await import('../src/services/automationAgent.ts');

// 1. Sauvegarder la fonction chromium.launch originale
const origLaunch = chromium.launch;
try {
  // Simuler un échec de lancement de Chromium
  (chromium as any).launch = async () => {
    throw new Error('Simulation: executable missing / sandbox error');
  };

  const result = await runPlaywrightApplication(job, profile, {});

  // Assertions strictes exigées par la consigne :
  // "Quand Chromium ne démarre pas, renvoie status: 'error' avec un message clair,
  // sans requête réseau vers l'adresse de l'offre et sans jamais renvoyer sent."
  assert.strictEqual(result.status, 'error', 'Le statut doit être strictement "error"');
  assert.notStrictEqual(result.status, 'sent', 'Le statut ne doit JAMAIS être "sent"');
  assert.ok(result.message.includes('Impossible de lancer le navigateur Playwright'), 'Message clair explicatif');
  assert.strictEqual(requestsReceived, 0, 'AUCUNE requête réseau ne doit être envoyée à l’URL de l’offre');
  assert.strictEqual(result.details?.confirmationVerified, false, 'confirmationVerified doit être false');

  console.log('  ✓ Statut "error" retourné sans envoi réseau et sans faux "sent"');
} finally {
  // Restaurer chromium.launch
  chromium.launch = origLaunch;
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : TEST DU MODE DE SECOURS SÉCURISÉ VALIDÉ !');
console.log('========================================================================\n');
