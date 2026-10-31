import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : Bouton « Renvoyer quand même » (force_resubmit) ===');

// 1. Isolation complète : dossiers temporaires
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-resubmit-test-'));
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
const baseCvPath = path.join(testUploadsDir, 'CV_Jean_Test.pdf');
fs.writeFileSync(baseCvPath, '%PDF-1.4 Fake Base CV Content for Testing');

const writeTable = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(testDataDir, `${name}.json`), JSON.stringify(data, null, 2));
};

// Snapshot des vrais dossiers avant test
const realDataDir = path.resolve(process.cwd(), 'data');
const realUploadsDir = path.resolve(process.cwd(), 'uploads');
const realDataBefore = fs.existsSync(realDataDir) ? fs.readdirSync(realDataDir) : [];
const realUploadsBefore = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir) : [];

let serverRequests = 0;
let fakeServerPort = 0;

// Fake HTTP server fournissant un formulaire d'emploi
const fakeServer = http.createServer((req, res) => {
  serverRequests++;
  if (req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Merci pour votre candidature !</h1><p>Nous avons bien reçu votre dossier.</p></body></html>');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
<head><title>Formulaire Recrutement</title></head>
<body>
  <form method="POST" action="/" enctype="multipart/form-data">
    <label for="firstname">Prénom</label>
    <input type="text" id="firstname" name="firstname" />
    <label for="lastname">Nom</label>
    <input type="text" id="lastname" name="lastname" />
    <label for="email">Email</label>
    <input type="email" id="email" name="email" />
    <label for="cv">CV</label>
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
    last_name: 'Test',
    email: 'jean@test.ch',
    privacy_consent: true,
    wanted_cantons: ['GE', 'VD'],
    cv_filename: 'CV_Jean_Test.pdf',
    cv_path: baseCvPath
  }
]);

writeTable('jobs', [
  {
    id: 301,
    title: 'Commercial B2B',
    company: 'Acme SA',
    canton: 'GE',
    workload: '100%',
    status: 'À postuler',
    url: fakeJobUrl
  },
  {
    id: 302,
    title: 'Consultant Vente',
    company: 'Nova SA',
    canton: 'VD',
    workload: '80-100%',
    status: 'À postuler',
    url: fakeJobUrl
  }
]);

// Candidatures préalables avec formulaire soumis sans confirmation
writeTable('applications', [
  {
    id: 1,
    job_id: 301,
    title: 'Commercial B2B',
    company: 'Acme SA',
    status: 'À vérifier',
    submitted_unconfirmed: true,
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    job_id: 302,
    title: 'Consultant Vente',
    company: 'Nova SA',
    status: 'À vérifier',
    submitted_unconfirmed: true,
    created_at: new Date().toISOString()
  }
]);

for (const t of ['settings', 'cv_variants', 'scraping_logs', 'scraping_tasks', 'cart']) {
  writeTable(t, []);
}

const engine = await import('../server/services/applicationEngine.ts');
const cartEngine = await import('../server/services/cartEngine.ts');
const { readTable } = await import('../server/db.ts');

try {
  console.log('\n--- Cas 1 : Tentative normale sans force_resubmit -> Refus immédiat avec avertissement ---');
  serverRequests = 0;
  const r1 = await engine.applyToJob(301, { headless: true, force_resubmit: false });

  assert.strictEqual(r1.refused, true, 'La candidature doit être refusée');
  assert.strictEqual(r1.submitted_unconfirmed, true, 'Le flag submitted_unconfirmed doit être vrai');
  assert.strictEqual(r1.display_status, 'a_verifier');
  assert.ok(
    r1.error?.includes('La candidature est peut-être déjà partie. Vérifie sur le site de l’entreprise avant de renvoyer.') ||
    r1.error?.includes('déjà été soumis'),
    `Le message doit avertir que la candidature est peut-être déjà partie. Reçu: ${r1.error}`
  );
  assert.strictEqual(serverRequests, 0, 'Aucun navigateur ne doit visiter le serveur lors du refus');
  console.log('  ✓ Refus immédiat sans requête réseau avec submitted_unconfirmed: true');

  console.log('\n--- Cas 2 : Appel avec force_resubmit: true -> Garde-fou contourné et envoi exécuté ---');
  const r2 = await engine.applyToJob(301, { headless: true, force_resubmit: true });

  assert.strictEqual(r2.refused, false, 'Le refus doit être contourné grâce à force_resubmit');
  assert.strictEqual(r2.success, true, 'L’application doit réussir');
  assert.strictEqual(r2.display_status, 'envoyee');
  assert.ok(serverRequests > 0, 'Le serveur a bien été contacté par Playwright');

  const apps = readTable('applications') as Array<Record<string, unknown>>;
  const app301 = apps.find((a) => a.job_id === 301);
  assert.ok(app301, 'Une entrée d’application doit exister pour l’offre 301');
  assert.strictEqual(app301.status, 'Envoyée', 'Le statut dans applications doit passer à Envoyée');
  console.log('  ✓ Envoi avec confirmation prouvée après force_resubmit');

  console.log('\n--- Cas 3 : Panier avec offre unconfirmed sans force_resubmit -> signalée submitted_unconfirmed ---');
  await cartEngine.addToCart(302);
  const cartSummary1 = await cartEngine.processCart({ headless: true, force_resubmit: false });

  assert.strictEqual(cartSummary1.sent_count, 0, 'Aucun envoi sans force_resubmit');
  assert.strictEqual(cartSummary1.review_count, 1, 'L’offre passe en revue / à vérifier');
  const cartAfter1 = cartEngine.getCart();
  const item302 = cartAfter1.find((i) => i.job_id === 302);
  assert.ok(item302, 'L’offre reste dans le panier pour décision');
  assert.strictEqual(item302.submitted_unconfirmed, true, 'L’item dans le panier porte submitted_unconfirmed: true');
  assert.ok(
    item302.last_cart_message?.includes('peut-être déjà partie') || item302.last_cart_message?.includes('déjà été soumis'),
    `Message explicatif dans le panier: ${item302.last_cart_message}`
  );
  console.log('  ✓ Offre bloquée dans le panier avec mention et submitted_unconfirmed');

  console.log('\n--- Cas 4 : Panier avec force_resubmit: true -> passe le garde-fou et retire l’offre certifiée ---');
  const cartSummary2 = await cartEngine.processCart({ headless: true, force_resubmit: true });

  assert.strictEqual(cartSummary2.sent_count, 1, 'L’offre doit être envoyée avec force_resubmit');
  const cartAfter2 = cartEngine.getCart();
  const item302After = cartAfter2.find((i) => i.job_id === 302);
  assert.strictEqual(item302After, undefined, 'L’offre certifiée envoyée est automatiquement retirée du panier');
  console.log('  ✓ Offre envoyée et retirée du panier');

  console.log('\n--- Vérification d’isolation stricte ---');
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
console.log('SUCCÈS : TOUS LES CONTRÔLES FORCE_RESUBMIT SONT VALIDÉS');
console.log('========================================================================\n');
