import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import crypto from 'crypto';

console.log('=== TEST SUITE : E2E Application Chain & Real Playwright Upload (Point 5 Blueprint) ===');

// Capture de l'état initial des répertoires réels pour l'assertion d'isolation
const rootPngBefore = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.png'));
const realUploadsDir = path.join(process.cwd(), 'uploads');
const realDataVariantsFile = path.join(process.cwd(), 'data', 'cv_variants.json');
const realUploadsBefore = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir).sort() : [];
const realCvVariantsBefore = fs.existsSync(realDataVariantsFile) ? fs.readFileSync(realDataVariantsFile, 'utf-8') : '[]';

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-e2e-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
const testScreenshotsDir = path.join(tmpDir, 'screenshots');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testUploadsDir, { recursive: true });
fs.mkdirSync(testScreenshotsDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;
process.env.JOBPILOT_SCREENSHOTS_DIR = testScreenshotsDir;

// Import dynamique pour garantir la prise en compte des variables d'environnement
const express = (await import('express')).default;
const { evaluateJobFilters } = await import('../src/services/jobFilterEngine.ts');
const { generateTailoredCv, runPlaywrightApplication } = await import('../src/services/automationAgent.ts');
const { readTable, mutateTable, UPLOADS_DIR } = await import('../server/db.ts');
const jobsRouter = (await import('../server/routes/jobs.ts')).default;

// 2. Serveur HTTP local de test simulant les formulaires de candidature
let lastUploadedFile: { filename: string; buffer: Buffer; sha256: string } | null = null;

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

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // Cas 1 : Formulaire avec confirmation explicite
  if (req.method === 'GET' && url === '/form-success') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Formulaire Candidature</title></head>
<body>
  <h1>Postuler chez CloudTech Geneva</h1>
  <form action="/submit-success" method="POST" enctype="multipart/form-data">
    <input name="firstname" type="text" placeholder="Prénom" />
    <input name="lastname" type="text" placeholder="Nom" />
    <input name="email" type="email" placeholder="E-mail" />
    <input name="phone" type="tel" placeholder="Téléphone" />
    <input name="cv" type="file" accept=".pdf" />
    <input name="privacy" type="checkbox" />
    <button type="submit">Postuler</button>
  </form>
</body>
</html>`);
    return;
  }

  if (req.method === 'POST' && url === '/submit-success') {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const fullBuffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
      if (boundaryMatch) {
        const boundary = boundaryMatch[1].trim().replace(/^"/, '').replace(/"$/, '');
        const parsed = extractMultipartFile(fullBuffer, boundary);
        if (parsed) {
          lastUploadedFile = {
            filename: parsed.filename,
            buffer: parsed.buffer,
            sha256: crypto.createHash('sha256').update(parsed.buffer).digest('hex')
          };
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Confirmation</title></head>
<body>
  <h1>Merci pour votre candidature !</h1>
  <p>Votre candidature a bien été transmise aux recruteurs.</p>
</body>
</html>`);
    });
    return;
  }

  // Cas 2 : Formulaire soumis sans page de confirmation explicite
  if (req.method === 'GET' && url === '/form-no-confirm') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
  <form action="/submit-no-confirm" method="POST" enctype="multipart/form-data">
    <input name="firstname" type="text" />
    <input name="lastname" type="text" />
    <input name="email" type="email" />
    <input name="phone" type="tel" />
    <input name="cv" type="file" />
    <input name="privacy" type="checkbox" />
    <button type="submit">Postuler</button>
  </form>
</body>
</html>`);
    return;
  }

  if (req.method === 'POST' && url === '/submit-no-confirm') {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<body>
  <h1>Page d'accueil de l'entreprise</h1>
  <p>Consultez nos actualités et produits.</p>
</body>
</html>`);
    });
    return;
  }

  // Cas 3 : Formulaire sans champ input[type=file] (échec de téléversement)
  if (req.method === 'GET' && url === '/form-upload-fail') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
  <h1>Formulaire sans téléversement</h1>
  <form action="/submit-fail" method="POST">
    <input name="firstname" type="text" />
    <input name="lastname" type="text" />
    <input name="email" type="email" />
    <input name="phone" type="tel" />
    <input name="privacy" type="checkbox" />
    <button type="submit">Postuler</button>
  </form>
</body>
</html>`);
    return;
  }

  // Cas 4 Négatif : Page contenant « envoyer » ou « candidature » sans confirmation explicite
  if (req.method === 'GET' && url === '/form-ambiguous') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
  <form action="/submit-ambiguous" method="POST" enctype="multipart/form-data">
    <input name="firstname" type="text" />
    <input name="lastname" type="text" />
    <input name="email" type="email" />
    <input name="phone" type="tel" />
    <input name="cv" type="file" />
    <input name="privacy" type="checkbox" />
    <button type="submit">Postuler</button>
  </form>
</body>
</html>`);
    return;
  }

  if (req.method === 'POST' && url === '/submit-ambiguous') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    // Contient "candidature" et "envoyer" mais SANS confirmation explicite
    res.end(`<!DOCTYPE html>
<html>
<body>
  <h1>Votre candidature</h1>
  <p>Cliquez sur le lien ci-dessous si vous souhaitez envoyer d'autres pièces jointes ultérieurement.</p>
</body>
</html>`);
    return;
  }

  // Cas 5 Négatif : Page d'erreur après soumission
  if (req.method === 'GET' && url === '/form-error') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
  <form action="/submit-error" method="POST" enctype="multipart/form-data">
    <input name="firstname" type="text" />
    <input name="lastname" type="text" />
    <input name="email" type="email" />
    <input name="phone" type="tel" />
    <input name="cv" type="file" />
    <input name="privacy" type="checkbox" />
    <button type="submit">Postuler</button>
  </form>
</body>
</html>`);
    return;
  }

  if (req.method === 'POST' && url === '/submit-error') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<body>
  <h1>Erreur</h1>
  <p>Une erreur est survenue lors de l'envoi de votre formulaire. Veuillez réessayer plus tard.</p>
</body>
</html>`);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const serverPort = await new Promise<number>(resolve => {
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as any;
    resolve(addr.port);
  });
});

let apiServer: http.Server | null = null;

try {
  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 1 : Une offre est retenue par evaluateJobFilters
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 1 : Évaluation de l’offre par le filtre ---');
  const testJob = {
    id: 999901,
    title: 'Senior Account Executive B2B SaaS',
    company: 'CloudTech Geneva SA',
    canton: 'GE',
    workload: '80-100%',
    salary: "135'000 CHF",
    url: `http://127.0.0.1:${serverPort}/form-success`,
    description: 'Recrutement Senior Account Executive B2B SaaS Genève.'
  };

  const candidateProfile = {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    current_title: 'Senior Account Executive',
    email: 'jean.desfontaines@me.com',
    phone: '+41 76 639 75 60',
    city: 'Genève',
    canton: 'GE',
    wanted_cantons: ['GE', 'VD'],
    salary_min: 120000,
    workload: '90%',
    privacy_consent: true,
    skills: ['Salesforce', 'Hubspot', 'SaaS', 'B2B'],
    experiences: [
      {
        title: 'Senior Account Executive',
        company: 'eEAT',
        location: 'Genève',
        start_date: '03/2022',
        end_date: '01/2025',
        dates: '03/2022 - 01/2025',
        realizations: ['Gestion portefeuille 500+ clients B2B']
      }
    ],
    cv_filename: 'CV_EN_Jean_Desfontaines_10.pdf'
  };

  const filterEval = evaluateJobFilters(testJob, candidateProfile);
  assert.strictEqual(filterEval.isExcluded, false, 'L’offre doit être retenue');
  assert.strictEqual(filterEval.isCantonUnknown, false, 'Le canton GE doit être reconnu');
  console.log('  ✓ Étape 1 validée : Offre retenue sans exclusion');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 2 : Le profil contient un cv_filename sélectionné et vérifié
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 2 : Vérification du CV de base dans le profil ---');
  const baseCvFilename = candidateProfile.cv_filename;
  const baseCvPath = path.join(testUploadsDir, baseCvFilename);

  // Création du vrai CV de base UNIQUEMENT dans le répertoire temporaire isolé
  fs.writeFileSync(baseCvPath, '%PDF-1.4 Real Base CV for Jean Desfontaines isolated test');
  assert.ok(fs.existsSync(baseCvPath), 'Le fichier CV de base existe sur le disque temporaire');
  console.log(`  ✓ Étape 2 validée : CV de base « ${baseCvFilename} » présent sur le disque temporaire`);

  // Sauvegarde du profil dans la table temporaire
  await mutateTable('user_profile', () => [{ ...candidateProfile, cv_path: baseCvPath }]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Étapes 3 & 4 : generateTailoredCv produit un PDF réel et enregistre les métadonnées
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étapes 3 & 4 : Génération du PDF adapté réel et métadonnées de variante ---');
  const tailored = await generateTailoredCv(testJob, { ...candidateProfile, cv_path: baseCvPath });

  assert.ok(tailored.tailoredCvFilename, 'Un nom de fichier adapté est retourné');
  assert.ok(tailored.tailoredCvPath, 'Un chemin absolu de fichier est retourné');
  assert.strictEqual(tailored.tailoredCvPath.startsWith(testUploadsDir), true, 'Le fichier adapté doit être écrit dans JOBPILOT_UPLOADS_DIR');
  assert.ok(fs.existsSync(tailored.tailoredCvPath), 'Le véritable fichier PDF existe physiquement');

  const stats = fs.statSync(tailored.tailoredCvPath);
  assert.ok(stats.size > 500, `Le PDF généré fait une taille réelle (${stats.size} octets)`);
  const expectedPdfBytes = fs.readFileSync(tailored.tailoredCvPath);
  const expectedPdfSha256 = crypto.createHash('sha256').update(expectedPdfBytes).digest('hex');

  // Contrôle des métadonnées dans la table cv_variants isolée
  const variants = readTable('cv_variants') || [];
  const recordedVariant = variants.find((v: any) => v.id === tailored.recommendedCvId || v.filename === tailored.tailoredCvFilename);
  assert.ok(recordedVariant, 'La variante doit être enregistrée dans cv_variants');
  assert.strictEqual(recordedVariant.source_cv_filename, baseCvFilename, 'source_cv_filename correspond au CV de base');
  assert.strictEqual(recordedVariant.job_id, testJob.id, 'job_id correspond à l’offre');
  assert.strictEqual(recordedVariant.status, 'active');
  console.log('  ✓ Étapes 3 & 4 validées : Vrai PDF généré et métadonnées enregistrées dans cv_variants');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 5 : Exécution Playwright CAS 1 — Confirmation explicite -> sent
  // Téléversement réel du fichier adapté et vérification NOM et HASH sha256
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 5 : Exécution Playwright Cas 1 (Confirmation explicite -> sent) ---');
  lastUploadedFile = null;

  const resSuccess = await runPlaywrightApplication(
    testJob,
    { ...candidateProfile, cv_path: tailored.tailoredCvPath, cv_filename: tailored.tailoredCvFilename },
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );

  assert.strictEqual(resSuccess.status, 'sent', 'Le statut doit être strictement sent');
  assert.strictEqual(resSuccess.details?.confirmationVerified, true, 'La preuve de confirmation doit être vérifiée');
  assert.ok(resSuccess.details?.fieldsFilled?.includes('cv_upload'), 'Le champ cv_upload doit être confirmé');

  // VÉRIFICATION DU FICHIER REÇU : EXACTITUDE NOM ET HASH SHA-256
  assert.ok(lastUploadedFile !== null, 'Le serveur de test doit avoir reçu le fichier uploadé');
  const uploadedFile = lastUploadedFile as { filename: string; buffer: Buffer; sha256: string };
  assert.strictEqual(uploadedFile.filename, tailored.tailoredCvFilename, 'Le nom du fichier reçu doit être exactement tailoredCvFilename');
  assert.strictEqual(uploadedFile.sha256, expectedPdfSha256, 'Le hash SHA-256 du fichier reçu doit correspondre à 100% au PDF généré');
  console.log(`  ✓ Cas 1 validé : Téléversement physique Playwright prouvé (Nom: ${uploadedFile.filename}, Hash SHA-256: ${uploadedFile.sha256.slice(0, 16)}...) -> Statut: sent`);

  // Enregistrement de la candidature envoyée pour tester l'idempotence directe
  const idempotencyKey = `${testJob.id}_${testJob.url}_${tailored.tailoredCvFilename}`;
  await mutateTable('applications', () => [
    {
      id: 'app-success-1',
      job_id: testJob.id,
      job_title: testJob.title,
      company: testJob.company,
      application_url: testJob.url,
      status: 'sent',
      tailored_cv_filename: tailored.tailoredCvFilename,
      idempotency_key: idempotencyKey,
      applied_at: new Date().toISOString()
    }
  ]);

  // Idempotence : une nouvelle tentative doit être ignorée
  const resIdempotent = await runPlaywrightApplication(
    testJob,
    candidateProfile,
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );
  assert.strictEqual(resIdempotent.status, 'already_submitted', 'L’idempotence doit empêcher toute double soumission');
  console.log('  ✓ Idempotence validée : Soumission répétée bloquée avec statut already_submitted');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 6 : Exécution Playwright CAS 2 — Sans confirmation explicite -> requires_review
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 6 : Exécution Playwright Cas 2 (Sans confirmation -> requires_review) ---');
  const jobNoConfirm = {
    ...testJob,
    id: 999902,
    url: `http://127.0.0.1:${serverPort}/form-no-confirm`
  };

  const resNoConfirm = await runPlaywrightApplication(
    jobNoConfirm,
    candidateProfile,
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );

  assert.strictEqual(resNoConfirm.status, 'requires_review', 'Sans message de confirmation, le statut doit être requires_review');
  assert.strictEqual(resNoConfirm.details?.confirmationVerified, false, 'confirmationVerified doit être false');
  console.log('  ✓ Cas 2 validé : Formulaire soumis sans preuve explicite -> Statut: requires_review');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 7 : Exécution Playwright CAS 3 — Échec de téléversement -> pas de sent (requires_review)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 7 : Exécution Playwright Cas 3 (Échec téléversement -> pas de sent) ---');
  const jobUploadFail = {
    ...testJob,
    id: 999903,
    url: `http://127.0.0.1:${serverPort}/form-upload-fail`
  };

  const resUploadFail = await runPlaywrightApplication(
    jobUploadFail,
    candidateProfile,
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );

  assert.notStrictEqual(resUploadFail.status, 'sent', 'Un téléversement non confirmé ne doit JAMAIS donner le statut sent');
  assert.strictEqual(resUploadFail.status, 'requires_review', 'Le statut doit être requires_review');
  assert.strictEqual(resUploadFail.details?.fieldsFilled?.includes('cv_upload'), false, 'cv_upload NE doit PAS être dans fieldsFilled');
  assert.ok(resUploadFail.details?.missingFields?.includes('cv_upload'), 'cv_upload doit être dans missingFields');
  console.log('  ✓ Cas 3 validé : Formulaire sans téléversement CV confirmé -> Statut: requires_review (pas de sent)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 8 : Tests négatifs confirmationVerified (Point demandé par l'utilisateur)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 8 : Tests négatifs confirmationVerified ---');

  // Test négatif A : Page contenant « envoyer » ou « candidature » sans confirmation explicite
  const jobAmbiguous = {
    ...testJob,
    id: 999904,
    url: `http://127.0.0.1:${serverPort}/form-ambiguous`
  };
  const resAmbiguous = await runPlaywrightApplication(
    jobAmbiguous,
    candidateProfile,
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );
  assert.strictEqual(resAmbiguous.status, 'requires_review', 'Page avec mots « candidature / envoyer » sans succès explicite doit être requires_review');
  assert.strictEqual(resAmbiguous.details?.confirmationVerified, false, 'confirmationVerified doit rester false');
  console.log('  ✓ Test négatif A validé : Mots « candidature / envoyer » isolés sans confirmation -> requires_review');

  // Test négatif B : Page d'erreur explicite après soumission
  const jobError = {
    ...testJob,
    id: 999905,
    url: `http://127.0.0.1:${serverPort}/form-error`
  };
  const resError = await runPlaywrightApplication(
    jobError,
    candidateProfile,
    {},
    { headless: true, cvPath: tailored.tailoredCvPath, cvFilename: tailored.tailoredCvFilename }
  );
  assert.strictEqual(resError.status, 'requires_review', 'Page d\'erreur explicite après soumission doit être requires_review');
  assert.strictEqual(resError.details?.confirmationVerified, false, 'confirmationVerified doit être false sur page d\'erreur');
  console.log('  ✓ Test négatif B validé : Page d\'erreur explicite post-soumission -> requires_review');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 9 : Test réel de la route Express POST /api/jobs/:id/auto-apply
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 9 : Test route réelle POST /api/jobs/:id/auto-apply ---');
  const jobForRoute = {
    id: 999910,
    title: 'Account Executive B2B Test Route',
    company: 'Geneva Route SA',
    canton: 'GE',
    workload: '80-100%',
    salary: "130'000 CHF",
    url: `http://127.0.0.1:${serverPort}/form-success`,
    description: 'Poste de test pour la route auto-apply.'
  };

  await mutateTable('jobs', () => [jobForRoute]);
  await mutateTable('applications', () => []); // Réinitialisation de la table de test

  const appExpress = express();
  appExpress.use(express.json());
  appExpress.use(jobsRouter);

  apiServer = appExpress.listen(0, '127.0.0.1');
  const apiPort = await new Promise<number>(resolve => {
    apiServer!.on('listening', () => {
      const addr = apiServer!.address() as any;
      resolve(addr.port);
    });
  });

  // Premier appel : soumission réelle vers /form-success
  const resRouteFirst = await fetch(`http://127.0.0.1:${apiPort}/api/jobs/999910/auto-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: { headless: true } })
  });
  const dataRouteFirst = await resRouteFirst.json();

  assert.strictEqual(resRouteFirst.status, 200, 'La route auto-apply doit renvoyer 200 OK');
  assert.strictEqual(dataRouteFirst.success, true, 'dataRouteFirst.success doit être true');
  assert.strictEqual(dataRouteFirst.automation_result?.status, 'sent', 'Le statut retourné doit être sent');

  // Vérification de l'enregistrement dans la table applications
  const savedApps = readTable('applications') || [];
  const recordedApp = savedApps.find((a: any) => String(a.job_id) === '999910');
  assert.ok(recordedApp, 'La candidature doit être enregistrée dans la table applications');
  assert.strictEqual(recordedApp.status, 'Envoyée', 'Le statut dans applications doit être Envoyée');
  const expectedKey = `999910_${jobForRoute.url}_cv_tailored_job_999910.pdf`;
  assert.strictEqual(recordedApp.idempotency_key, expectedKey, 'L’idempotency_key enregistrée doit correspondre exactement');
  console.log('  ✓ Premier appel POST /api/jobs/:id/auto-apply réussi : candidature enregistrée et idempotency_key vérifiée');

  // Deuxième appel : refus d'une deuxième soumission (idempotence)
  const resRouteSecond = await fetch(`http://127.0.0.1:${apiPort}/api/jobs/999910/auto-apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options: { headless: true } })
  });
  const dataRouteSecond = await resRouteSecond.json();
  assert.ok(resRouteSecond.status === 200 || resRouteSecond.status === 400);
  assert.strictEqual(dataRouteSecond.automation_result?.status, 'already_submitted', 'Le statut de la deuxième tentative doit être already_submitted');
  console.log('  ✓ Deuxième appel POST /api/jobs/:id/auto-apply bloqué : statut already_submitted, aucune double soumission');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 10 : Vérification d'isolation stricte (Zéro pollution uploads/, data/ et racine)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 10 : Contrôle d’isolation des fichiers réels ---');
  const realUploadsAfter = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir).sort() : [];
  const realCvVariantsAfter = fs.existsSync(realDataVariantsFile) ? fs.readFileSync(realDataVariantsFile, 'utf-8') : '[]';
  const rootPngAfter = fs.readdirSync(process.cwd()).filter(f => f.endsWith('.png'));

  assert.deepStrictEqual(realUploadsAfter, realUploadsBefore, 'Aucun fichier ne doit apparaître dans le vrai uploads/');
  assert.strictEqual(realCvVariantsAfter, realCvVariantsBefore, 'Aucune ligne de data/cv_variants.json ne doit changer');
  assert.deepStrictEqual(rootPngAfter, rootPngBefore, 'Aucune capture PNG ne doit apparaître à la racine du dépôt');
  console.log('  ✓ Isolation totale vérifiée : vrai uploads/, data/cv_variants.json et racine du dépôt strictement intacts');

} finally {
  server.close();
  if (apiServer) {
    (apiServer as http.Server).close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS TOTAL : CHAÎNE E2E AVEC PLAYWRIGHT, FICHIER EXACT ET PREUVES VALIDÉE !');
console.log('========================================================================\n');
