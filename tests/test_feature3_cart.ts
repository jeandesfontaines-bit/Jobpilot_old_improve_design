import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : Fonction 3 (Panier de candidatures, Traitement séquentiel, Simulation & Quota) ===\n');

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-cart-test-'));
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
  Buffer.from('%PDF-1.4\n% Fake base CV for testing cart functionality\n%%EOF')
);

// 2. Faux serveur HTTP simulant les 3 cas d'offres
let form1Submitted = false;
let form2Submitted = false;
let form3Blocked = false;

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

  // Cas 1 : Offre avec confirmation explicite
  if (parsedUrl.pathname === '/form-success') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Formulaire Valide</title></head>
        <body>
          <h1>Postuler - Offre 1</h1>
          <form action="/submit-success" method="POST" enctype="multipart/form-data">
            <input type="text" name="firstname" id="firstname" />
            <input type="text" name="lastname" id="lastname" />
            <input type="email" name="email" id="email" />
            <input type="file" name="resume" id="resume" />
            <button type="submit" id="submit-btn">Envoyer</button>
          </form>
        </body>
      </html>
    `);
    return;
  }

  if (parsedUrl.pathname === '/submit-success' && req.method === 'POST') {
    form1Submitted = true;
    res.writeHead(302, { Location: '/confirmation-success' });
    res.end();
    return;
  }

  if (parsedUrl.pathname === '/confirmation-success') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Confirmation</title></head>
        <body>
          <h1>Merci pour votre candidature</h1>
          <p>Votre candidature a bien été transmise à notre équipe RH.</p>
        </body>
      </html>
    `);
    return;
  }

  // Cas 2 : Offre sans confirmation explicite (requires_review)
  if (parsedUrl.pathname === '/form-no-confirm') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Formulaire Sans Confirmation</title></head>
        <body>
          <h1>Postuler - Offre 2</h1>
          <form action="/submit-no-confirm" method="POST" enctype="multipart/form-data">
            <input type="text" name="firstname" id="firstname" />
            <input type="text" name="lastname" id="lastname" />
            <input type="email" name="email" id="email" />
            <input type="file" name="resume" id="resume" />
            <button type="submit" id="submit-btn">Envoyer</button>
          </form>
        </body>
      </html>
    `);
    return;
  }

  if (parsedUrl.pathname === '/submit-no-confirm' && req.method === 'POST') {
    form2Submitted = true;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Page Suivante</title></head>
        <body>
          <p>Redirection vers le portail principal de l'entreprise.</p>
        </body>
      </html>
    `);
    return;
  }

  // Cas 3 : Offre bloquante avec CAPTCHA visuel réel
  if (parsedUrl.pathname === '/form-blocked') {
    form3Blocked = true;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Vérification de sécurité</title></head>
        <body>
          <h1>Sécurité requise</h1>
          <iframe src="https://www.google.com/recaptcha/api2/anchor" style="width: 300px; height: 80px; display: block;"></iframe>
          <p>Veuillez prouver que vous n'êtes pas un robot avant de continuer.</p>
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

const baseUrl = `http://127.0.0.1:${formPort}`;

// Données de test
const initialProfile = [
  {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    email: 'jean.desfontaines@test.ch',
    phone: '+41 76 639 75 60',
    current_title: 'Senior Account Executive',
    wanted_roles: ['Account Executive', 'Key Account Manager', 'Sales Operations'],
    wanted_cantons: ['GE', 'VD'],
    excluded_roles: ['vendeur boulangerie'],
    privacy_consent: true,
    cv_filename: baseCvFilename
  }
];

const testJobs = [
  {
    id: 101,
    title: 'Key Account Manager SaaS B2B',
    company: 'Tech Solutions SA',
    location: 'Genève',
    canton: 'GE',
    workload: '80-100%',
    status: 'À postuler',
    url: `${baseUrl}/form-success`
  },
  {
    id: 102,
    title: 'Sales Operations Specialist',
    company: 'Cloud Services Gen',
    location: 'Lausanne',
    canton: 'VD',
    workload: '90%',
    status: 'À postuler',
    url: `${baseUrl}/form-no-confirm`
  },
  {
    id: 103,
    title: 'Account Executive Fintech',
    company: 'Secure Bank AG',
    location: 'Genève',
    canton: 'GE',
    workload: '100%',
    status: 'À postuler',
    url: `${baseUrl}/form-blocked`
  },
  {
    id: 104,
    title: 'Offre Déjà Envoyée',
    company: 'Ancien Recruteur SA',
    location: 'Genève',
    canton: 'GE',
    workload: '100%',
    status: 'Envoyée',
    url: `${baseUrl}/form-success`
  }
];

const initialApplications = [
  {
    id: 9001,
    job_id: 104,
    title: 'Offre Déjà Envoyée',
    status: 'Envoyée',
    sent_at: new Date().toISOString()
  }
];

const initialSettings = [
  {
    daily_submission_quota: 5,
    daily_application_limit: 5,
    privacy_consent: true
  }
];

// Initialisation des tables dans l'espace isolé
fs.writeFileSync(path.join(testDataDir, 'user_profile.json'), JSON.stringify(initialProfile, null, 2));
fs.writeFileSync(path.join(testDataDir, 'jobs.json'), JSON.stringify(testJobs, null, 2));
fs.writeFileSync(path.join(testDataDir, 'applications.json'), JSON.stringify(initialApplications, null, 2));
fs.writeFileSync(path.join(testDataDir, 'settings.json'), JSON.stringify(initialSettings, null, 2));
fs.writeFileSync(path.join(testDataDir, 'cart.json'), JSON.stringify([], null, 2));

// Import dynamique des modules reliés au DATA_DIR isolé
const { readTable, writeTable } = await import('../server/db.ts');
const {
  addToCart,
  removeFromCart,
  clearCart,
  getCart,
  processCart,
  stopCartProcessing,
  getCartProcessingState
} = await import('../server/services/cartEngine.ts');

console.log('--- Test 1 : Ajout d\'offres au panier et refus d\'une offre déjà envoyée ---');

// Ajout offre 101
const addRes1 = await addToCart(101);
assert.strictEqual(addRes1.success, true, 'Offre 101 doit être ajoutée au panier');
assert.strictEqual(addRes1.cart.length, 1, 'Panier doit contenir 1 élément');

// Ajout offre 102
const addRes2 = await addToCart(102);
assert.strictEqual(addRes2.success, true, 'Offre 102 doit être ajoutée au panier');
assert.strictEqual(addRes2.cart.length, 2, 'Panier doit contenir 2 éléments');

// Ajout offre 103
const addRes3 = await addToCart(103);
assert.strictEqual(addRes3.success, true, 'Offre 103 doit être ajoutée au panier');
assert.strictEqual(addRes3.cart.length, 3, 'Panier doit contenir 3 éléments');

// Refus strict offre 104 déjà envoyée
const addResAlreadySent = await addToCart(104);
assert.strictEqual(addResAlreadySent.success, false, 'Offre déjà envoyée doit être STRICTEMENT refusée');
assert.ok(
  addResAlreadySent.error?.includes('déjà envoyée'),
  'Le motif de refus doit expliciter que l\'offre est déjà envoyée'
);
assert.strictEqual(getCart().length, 3, 'Le panier ne doit pas avoir inclus l\'offre déjà envoyée');
console.log('  ✓ Les 3 offres sont ajoutées et l\'offre déjà envoyée est strictement refusée (HTTP 400/erreur)');

console.log('\n--- Test 2 : Persistance du panier (résiste au rechargement) ---');
const cartOnDisk = JSON.parse(fs.readFileSync(path.join(testDataDir, 'cart.json'), 'utf-8'));
assert.strictEqual(cartOnDisk.length, 3, 'Le fichier physique cart.json doit contenir 3 offres');
assert.strictEqual(cartOnDisk[0].job_id, 101);
assert.strictEqual(cartOnDisk[1].job_id, 102);
assert.strictEqual(cartOnDisk[2].job_id, 103);
console.log('  ✓ Persistance disque cart.json validée (survit au redémarrage)');

console.log('\n--- Test 3 : Mode « Simuler le panier » (remplit les champs sans soumettre) ---');
const simSummary = await processCart({ simulate: true, pauseMs: 10 });
assert.strictEqual(simSummary.success, true);
assert.strictEqual(simSummary.mode, 'simulate');
assert.strictEqual(simSummary.total_processed, 3);
assert.strictEqual(simSummary.simulated_count, 3);
assert.strictEqual(simSummary.sent_count, 0, 'Aucune offre ne doit être envoyée en mode simulation');
assert.strictEqual(simSummary.remaining_in_cart, 3, 'Toutes les offres doivent rester dans le panier en simulation');

// Vérification que le CV utilisé est bien tracé pour chaque offre
for (const [jobId, info] of Object.entries(simSummary.item_statuses)) {
  assert.strictEqual(info.status, 'simulee');
  assert.ok(info.cv_used, `CV utilisé doit être indiqué pour le job ${jobId}`);
}
console.log('  ✓ Mode simulation validé : aucun formulaire soumis, CV tracé, panier 100% conservé');

console.log('\n--- Test 4 : Traitement séquentiel réel (une confirmée, une sans, une bloquée) ---');
const execSummary = await processCart({ simulate: false, pauseMs: 50 });
assert.strictEqual(execSummary.success, true);
assert.strictEqual(execSummary.total_processed, 3);
assert.strictEqual(execSummary.sent_count, 1, 'Exactement 1 offre doit être envoyée avec confirmation');
assert.strictEqual(execSummary.review_count, 1, 'Exactement 1 offre doit être placée à vérifier');
assert.ok(
  execSummary.intervention_count === 1 || execSummary.failed_count === 1,
  'L\'offre avec captcha doit être placée en intervention nécessaire ou échec'
);

// Statuts individuels enregistrés
assert.strictEqual(execSummary.item_statuses[101].status, 'envoyee', 'Job 101 doit être envoyee');
assert.strictEqual(execSummary.item_statuses[102].status, 'a_verifier', 'Job 102 doit être a_verifier');
assert.ok(
  execSummary.item_statuses[103].status === 'intervention' || execSummary.item_statuses[103].status === 'echec',
  'Job 103 doit être intervention ou echec'
);
console.log('  ✓ Traitement séquentiel validé : Offre 101 envoyée, 102 à vérifier, 103 intervention/échec');

console.log('\n--- Test 5 : Règle de conservation du panier (seules les offres non envoyées restent) ---');
const remainingCart = getCart();
assert.strictEqual(remainingCart.length, 2, 'Le panier ne doit conserver QUE les 2 offres non envoyées');
assert.strictEqual(
  remainingCart.some((i) => i.job_id === 101),
  false,
  'L\'offre 101 (envoyée avec succès) doit avoir été RETIRÉE automatiquement du panier'
);
assert.strictEqual(
  remainingCart.some((i) => i.job_id === 102),
  true,
  'L\'offre 102 (à vérifier) doit RESTER dans le panier'
);
assert.strictEqual(
  remainingCart.some((i) => i.job_id === 103),
  true,
  'L\'offre 103 (bloquée) doit RESTER dans le panier'
);
console.log('  ✓ Règle de conservation du panier validée (seules les offres non envoyées sont conservées)');

console.log('\n--- Test 6 : Quota quotidien Europe/Zurich (arrêt propre dès la limite) ---');
// Vider le panier et ajouter deux nouvelles offres valides
await clearCart();
await addToCart(102);

// Forcer le quota journalier à 1 (or 1 application a déjà été envoyée aujourd'hui avec Job 101)
const settingsWithLowQuota = [
  {
    daily_submission_quota: 1,
    daily_application_limit: 1,
    privacy_consent: true
  }
];
fs.writeFileSync(path.join(testDataDir, 'settings.json'), JSON.stringify(settingsWithLowQuota, null, 2));

const quotaSummary = await processCart({ simulate: false, pauseMs: 10 });
assert.strictEqual(quotaSummary.stopped, true, 'Le panier doit s\'arrêter proprement quand le quota est atteint');
assert.ok(
  quotaSummary.stop_reason?.toLowerCase().includes('quota journalier europe/zurich'),
  'Le motif d\'arrêt doit mentionner le quota Europe/Zurich'
);
console.log('  ✓ Quota Europe/Zurich respecté : le panier s\'arrête proprement sans soumission illicite');

// 7. Nettoyage
formServer.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n========================================================================');
console.log('SUCCÈS TOTAL : LES 6 SPÉCIFICATIONS DU PANIER SONT 100% VALIDÉES !');
console.log('========================================================================');
