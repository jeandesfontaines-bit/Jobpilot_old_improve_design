import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : Fonction 2 (Postuler en 1 clic & Refus des offres exclues / déjà envoyées) ===\n');

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-apply-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
const testScreenshotsDir = path.join(tmpDir, 'screenshots');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testUploadsDir, { recursive: true });
fs.mkdirSync(testScreenshotsDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;
process.env.JOBPILOT_SCREENSHOTS_DIR = testScreenshotsDir;

// Création du CV de base physique
const baseCvFilename = 'CV_EN_Jean_Desfontaines_10.pdf';
fs.writeFileSync(
  path.join(testUploadsDir, baseCvFilename),
  Buffer.from('%PDF-1.4\n% Fake base CV for testing one click apply\n%%EOF')
);

// 2. Faux serveur HTTP simulant le formulaire employeur
let formRequestsReceived = 0;
let lastUploadedFile: { filename: string; buffer: Buffer } | null = null;

function extractMultipartFile(bodyBuffer: Buffer, boundary: string): { filename: string; buffer: Buffer } | null {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let startIdx = bodyBuffer.indexOf(boundaryBuffer);
  while (startIdx !== -1) {
    const nextBoundary = bodyBuffer.indexOf(boundaryBuffer, startIdx + boundaryBuffer.length);
    if (nextBoundary === -1) break;

    const partBuffer = bodyBuffer.subarray(startIdx + boundaryBuffer.length, nextBoundary);
    const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEndIndex !== -1) {
      const headerStr = partBuffer.subarray(0, headerEndIndex).toString('utf-8');
      const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
      if (filenameMatch) {
        let fileData = partBuffer.subarray(headerEndIndex + 4);
        if (fileData.length >= 2 && fileData[fileData.length - 2] === 0x0D && fileData[fileData.length - 1] === 0x0A) {
          fileData = fileData.subarray(0, fileData.length - 2);
        }
        return {
          filename: path.basename(filenameMatch[1]),
          buffer: fileData
        };
      }
    }
    startIdx = nextBoundary;
  }
  return null;
}

const formServer = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host}`);

  if (parsedUrl.pathname === '/form') {
    formRequestsReceived++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Formulaire Recrutement</title></head>
        <body>
          <h1>Postuler en ligne</h1>
          <form action="/submit" method="POST" enctype="multipart/form-data">
            <input type="text" name="firstname" id="firstname" />
            <input type="text" name="lastname" id="lastname" />
            <input type="email" name="email" id="email" />
            <input type="file" name="resume" id="resume" />
            <button type="submit" id="submit-btn">Envoyer ma candidature</button>
          </form>
        </body>
      </html>
    `);
    return;
  }

  if (parsedUrl.pathname === '/submit' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(chunks);
      if (boundary) {
        const file = extractMultipartFile(bodyBuffer, boundary);
        if (file) {
          lastUploadedFile = file;
        }
      }
      res.writeHead(302, { Location: '/confirmation' });
      res.end();
    });
    return;
  }

  if (parsedUrl.pathname === '/confirmation') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Confirmation</title></head>
        <body>
          <h1>Merci pour votre candidature</h1>
          <p>Votre candidature a bien été reçue avec succès.</p>
        </body>
      </html>
    `);
    return;
  }

  res.writeHead(404);
  res.end();
});

let formPort = 0;
await new Promise<void>((resolve) => {
  formServer.listen(0, '127.0.0.1', () => {
    formPort = (formServer.address() as any).port;
    resolve();
  });
});

const formUrl = `http://127.0.0.1:${formPort}/form`;

// Données de test
const initialProfile = [
  {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    email: 'jean.desfontaines@test.ch',
    phone: '+41 76 639 75 60',
    current_title: 'Senior Account Executive',
    wanted_roles: ['Account Executive'],
    wanted_cantons: ['GE', 'VD'],
    excluded_roles: ['vendeur boulangerie'],
    privacy_consent: true,
    cv_filename: baseCvFilename
  }
];

const initialJobs = [
  {
    id: 991,
    title: 'Senior Account Executive B2B',
    company: 'Tech Cloud SA',
    canton: 'GE',
    url: formUrl,
    status: 'Nouvelle'
  },
  {
    id: 992,
    title: 'Vendeur / vendeuse en boulangerie 100%',
    company: 'Boulangerie du Coin',
    canton: 'GE',
    url: formUrl,
    status: 'Nouvelle'
  },
  {
    id: 993,
    title: 'Key Account Manager Santé',
    company: 'Pharma SA',
    canton: 'VD',
    url: formUrl,
    status: 'Envoyée'
  }
];

// Initialisation de la table applications avec une candidature déjà existante pour 993
const initialApplications = [
  {
    id: 1700000001,
    job_id: 993,
    title: 'Key Account Manager Santé',
    company: 'Pharma SA',
    status: 'Envoyée',
    created_at: new Date().toISOString()
  }
];

fs.writeFileSync(path.join(testDataDir, 'user_profile.json'), JSON.stringify(initialProfile, null, 2));
fs.writeFileSync(path.join(testDataDir, 'jobs.json'), JSON.stringify(initialJobs, null, 2));
fs.writeFileSync(path.join(testDataDir, 'applications.json'), JSON.stringify(initialApplications, null, 2));
fs.writeFileSync(path.join(testDataDir, 'settings.json'), JSON.stringify([{}], null, 2));

// Imports dynamiques
const express = (await import('express')).default;
const jobsRouter = (await import('../server/routes/jobs.ts')).default;
const { readTable } = await import('../server/db.ts');

const app = express();
app.use(express.json());
app.use(jobsRouter);

let apiServer: http.Server | undefined;
let apiPort = 0;

try {
  await new Promise<void>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      apiServer = s;
      apiPort = (s.address() as any).port;
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST CAS 1 : Refus strict d'une offre exclue par evaluateJobFilters
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Test Cas 1 : Offre exclue par les règles du profil (job 992 : boulanger) ---');
  const uploadsBeforeCas1 = fs.readdirSync(testUploadsDir);
  const requestsBeforeCas1 = formRequestsReceived;

  const resExcluded = await fetch(`${baseUrl}/api/jobs/992/auto-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headless: true })
  });
  const dataExcluded: any = await resExcluded.json();

  assert.strictEqual(resExcluded.status, 400, 'L’appel sur une offre exclue doit renvoyer HTTP 400');
  assert.strictEqual(dataExcluded.success, false);
  assert.strictEqual(dataExcluded.refused, true);
  assert.ok(dataExcluded.error?.includes('Offre exclue par vos critères'));

  // Vérification qu'aucun CV n'a été généré pour le job 992
  const uploadsAfterCas1 = fs.readdirSync(testUploadsDir);
  const tailoredForJob2 = uploadsAfterCas1.find(f => f.includes('992'));
  assert.strictEqual(tailoredForJob2, undefined, 'Aucun fichier CV adapté ne doit avoir été généré');
  assert.strictEqual(uploadsAfterCas1.length, uploadsBeforeCas1.length);

  // Vérification qu'aucun navigateur n'a été ouvert (aucune requête reçue sur le serveur employeur)
  assert.strictEqual(
    formRequestsReceived,
    requestsBeforeCas1,
    'Aucun navigateur Playwright ne doit être ouvert sur une offre exclue'
  );
  console.log('  ✓ Offre exclue immédiatement refusée (HTTP 400, zéro CV créé, zéro navigateur ouvert)');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST CAS 2 : Offre valide -> Envoi réussi avec preuve
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Cas 2 : Offre valide (job 991 : Senior Account Executive) ---');
  const resValid = await fetch(`${baseUrl}/api/jobs/991/auto-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headless: true })
  });
  const dataValid: any = await resValid.json();

  assert.strictEqual(resValid.status, 200, 'L’appel valide doit renvoyer HTTP 200');
  assert.strictEqual(dataValid.success, true);
  assert.strictEqual(dataValid.display_status, 'envoyee');
  assert.strictEqual(dataValid.display_label, 'Envoyée avec preuve');
  assert.strictEqual(dataValid.automation_result?.status, 'sent');

  // Vérification de l'enregistrement en table applications
  const apps = readTable('applications') || [];
  const recordedApp = apps.find((a: any) => String(a.job_id) === '991');
  assert.ok(recordedApp, 'La candidature 991 doit figurer dans la table applications');
  assert.strictEqual(recordedApp.status, 'Envoyée');

  // Vérification du téléversement du fichier reçu
  const uploaded = lastUploadedFile as { filename: string; buffer: Buffer } | null;
  assert.ok(uploaded, 'Le serveur employeur doit avoir reçu le fichier');
  assert.ok(uploaded.filename.includes('991') || uploaded.filename.includes('CV'));

  // Vérification de la carte job annotée
  const jobsTable = readTable('jobs') || [];
  const updatedJob1 = jobsTable.find((j: any) => String(j.id) === '991');
  assert.strictEqual(updatedJob1.last_application_result?.display_status, 'envoyee');
  assert.strictEqual(updatedJob1.last_application_result?.display_label, 'Envoyée avec preuve');
  console.log('  ✓ Offre valide postulée avec succès (statut: envoyee, preuve reçue et enregistrée)');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST CAS 3 : Offre déjà envoyée -> Refusée
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Test Cas 3 : Offre déjà envoyée (job 993 : déjà postulée) ---');
  const resAlreadySent = await fetch(`${baseUrl}/api/jobs/993/auto-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headless: true })
  });
  const dataAlreadySent: any = await resAlreadySent.json();

  assert.strictEqual(resAlreadySent.status, 400, 'L’appel sur une offre déjà envoyée doit renvoyer HTTP 400');
  assert.strictEqual(dataAlreadySent.success, false);
  assert.strictEqual(dataAlreadySent.refused, true);
  assert.strictEqual(dataAlreadySent.display_status, 'deja_envoyee');
  assert.ok(dataAlreadySent.error?.includes('déjà fait l’objet d’une candidature'));
  console.log('  ✓ Offre déjà envoyée refusée sans double soumission (HTTP 400, statut: deja_envoyee)');

} finally {
  formServer.close();
  if (apiServer) {
    apiServer.close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS TOTAL : LES 3 CAS DE POSTULATION EN 1 CLIC SONT VALIDÉS !');
console.log('========================================================================\n');
