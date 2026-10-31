import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : Mode essai (simulate: true) ===');

// 1. Isolation complète : dossiers temporaires
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-trial-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
const testScreenshotsDir = path.join(tmpDir, 'screenshots');
for (const dir of [testDataDir, testUploadsDir, testScreenshotsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;
process.env.JOBPILOT_SCREENSHOTS_DIR = testScreenshotsDir;

// Écriture d'un faux CV PDF de base
const baseCvPath = path.join(testUploadsDir, 'CV_Jean_Trial.pdf');
fs.writeFileSync(baseCvPath, '%PDF-1.4 Fake Base CV for Trial Testing');

const writeTable = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(testDataDir, `${name}.json`), JSON.stringify(data, null, 2));
};

// Snapshot des vrais dossiers avant test
const realDataDir = path.resolve(process.cwd(), 'data');
const realUploadsDir = path.resolve(process.cwd(), 'uploads');
const realDataBefore = fs.existsSync(realDataDir) ? fs.readdirSync(realDataDir) : [];
const realUploadsBefore = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir) : [];

let postRequestsReceived = 0;
let getRequestsReceived = 0;
let fakeServerPort = 0;

// Fake HTTP server fournissant un formulaire d'emploi
const fakeServer = http.createServer((req, res) => {
  if (req.method === 'POST') {
    postRequestsReceived++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Formulaire soumis !</h1></body></html>');
    return;
  }

  getRequestsReceived++;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head><title>Candidature Développeur</title></head>
<body>
  <form method="POST" action="/" enctype="multipart/form-data">
    <label for="firstname">Prénom</label>
    <input type="text" id="firstname" name="firstname" />
    <label for="lastname">Nom</label>
    <input type="text" id="lastname" name="lastname" />
    <label for="email">Email</label>
    <input type="email" id="email" name="email" />
    <label for="phone">Téléphone</label>
    <input type="tel" id="phone" name="phone" />
    <label for="cv">Téléversez votre CV</label>
    <input type="file" id="cv" name="cv" />
    <button type="submit" id="submit-btn">Envoyer ma candidature</button>
  </form>
</body>
</html>`);
});

await new Promise<void>((resolve) => {
  fakeServer.listen(0, '127.0.0.1', () => {
    const addr = fakeServer.address();
    fakeServerPort = typeof addr === 'object' && addr ? addr.port : 0;
    resolve();
  });
});

const fakeJobUrl = `http://127.0.0.1:${fakeServerPort}/`;

writeTable('user_profile', [
  {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    email: 'jean.desfontaines@example.ch',
    phone: '+41 79 123 45 67',
    privacy_consent: true,
    wanted_cantons: ['GE', 'VD'],
    cv_filename: 'CV_Jean_Trial.pdf',
    cv_path: baseCvPath
  }
]);

writeTable('jobs', [
  {
    id: 401,
    title: 'Développeur Fullstack',
    company: 'TechCorp SA',
    canton: 'GE',
    workload: '100%',
    status: 'À postuler',
    url: fakeJobUrl
  }
]);

for (const t of ['applications', 'settings', 'cv_variants', 'scraping_logs', 'scraping_tasks', 'cart']) {
  writeTable(t, []);
}

const engine = await import('../server/services/applicationEngine.ts');
const { readTable } = await import('../server/db.ts');

try {
  console.log('\n--- Exécution de applyToJob en mode essai (simulate: true) ---');
  postRequestsReceived = 0;
  getRequestsReceived = 0;

  const result = await engine.applyToJob(401, { headless: true, simulate: true });

  console.log('Resultat du mode essai :', {
    success: result.success,
    simulated: result.simulated,
    display_status: result.display_status,
    automation_status: result.automation_result?.status,
    fields: result.automation_result?.details?.fieldsFilled
  });

  // 1. Contrôle du résultat de simulation
  assert.strictEqual(result.success, true, 'Le mode essai doit retourner success: true');
  assert.strictEqual(result.simulated, true, 'Le flag simulated doit être true');
  assert.strictEqual(result.display_status, 'simulee', 'Le display_status doit être simulee');
  assert.strictEqual(result.automation_result?.status, 'simulated', 'Le statut automation doit être simulated');

  // 2. Contrôle des champs préremplis et du téléversement Playwright
  const fieldsFilled = result.automation_result?.details?.fieldsFilled || [];
  assert.ok(fieldsFilled.includes('firstname'), 'Le champ prénom doit être rempli');
  assert.ok(fieldsFilled.includes('lastname'), 'Le champ nom doit être rempli');
  assert.ok(fieldsFilled.includes('email'), 'Le champ email doit être rempli');
  assert.ok(fieldsFilled.includes('cv_upload'), 'Le fichier CV doit être téléversé dans le champ file');

  // 3. Contrôle fondamental : AUCUN clic d'envoi n'a eu lieu
  assert.ok(getRequestsReceived > 0, 'Le formulaire a bien été chargé via GET');
  assert.strictEqual(
    postRequestsReceived,
    0,
    'AUCUNE requête POST de soumission ne doit avoir été envoyée en mode essai'
  );
  console.log('  ✓ Le formulaire et le CV ont été remplis sans cliquer sur envoi');

  // 4. Contrôle de non-pollution de la table applications
  const apps = readTable('applications') as Array<Record<string, unknown>>;
  assert.strictEqual(
    apps.length,
    0,
    'Aucune ligne ne doit être créée dans la table applications lors d’un essai'
  );
  console.log('  ✓ Aucune candidature enregistrée dans la table applications');

  // 5. Contrôle du statut de l’offre dans la table jobs
  const jobs = readTable('jobs') as Array<Record<string, unknown>>;
  const job401 = jobs.find((j) => j.id === 401);
  assert.ok(job401, 'L’offre 401 doit exister');
  assert.strictEqual(job401.status, 'À postuler', 'Le statut principal de l’offre ne doit pas passer à Envoyée');
  const lastRes = job401.last_application_result as Record<string, unknown>;
  assert.ok(lastRes, 'last_application_result doit être renseigné');
  assert.strictEqual(lastRes.status, 'simulated');
  assert.strictEqual(lastRes.display_status, 'simulee');
  console.log('  ✓ L’offre conserve son statut et affiche l’essai réussi (simulee)');

  // 6. Vérification d’isolation stricte
  const realDataAfter = fs.existsSync(realDataDir) ? fs.readdirSync(realDataDir) : [];
  const realUploadsAfter = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir) : [];
  assert.deepStrictEqual(realDataBefore, realDataAfter, 'Le vrai dossier data/ ne doit pas être modifié');
  assert.deepStrictEqual(realUploadsBefore, realUploadsAfter, 'Le vrai dossier uploads/ ne doit pas être modifié');
  console.log('  ✓ Aucun fichier touché dans les vrais dossiers data/ et uploads/');
} finally {
  fakeServer.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : LE MODE ESSAI (SIMULATE: TRUE) EST VALIDÉ');
console.log('========================================================================\n');
