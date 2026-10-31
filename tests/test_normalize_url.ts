import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : Normalisation URL & Parcours Essai (annonce -> formulaire, nouvel onglet, blocages) ===');

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-normalize-url-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
const testScreenshotsDir = path.join(tmpDir, 'screenshots');
for (const dir of [testDataDir, testUploadsDir, testScreenshotsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;
process.env.JOBPILOT_SCREENSHOTS_DIR = testScreenshotsDir;

const baseCvPath = path.join(testUploadsDir, 'CV_Jean_Test_Normalize.pdf');
fs.writeFileSync(baseCvPath, '%PDF-1.4 Fake Base CV for Normalize URL & Trial Flow Tests');

const writeTable = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(testDataDir, `${name}.json`), JSON.stringify(data, null, 2));
};

const realDataDir = path.resolve(process.cwd(), 'data');
const realUploadsDir = path.resolve(process.cwd(), 'uploads');
const realDataBefore = fs.existsSync(realDataDir) ? fs.readdirSync(realDataDir) : [];
const realUploadsBefore = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir) : [];

const { normalizeJobUrl, originPortal } = await import('../src/lib/jobs.ts');
const { extractJobRoomAd } = await import('../src/services/jobRoomConnector.ts');
const engine = await import('../server/services/applicationEngine.ts');
const { runPlaywrightApplication } = await import('../src/services/automationAgent.ts');
const { readTable } = await import('../server/db.ts');

// ─────────────────────────────────────────────────────────────────────────────
// PARTIE 1 : Tests unitaires de normalizeJobUrl & extractJobRoomAd
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. Tests unitaires de normalizeJobUrl ---');

// Adresse sans schéma (commençant par www.)
assert.strictEqual(
  normalizeJobUrl('www.jobs.ch/de/stellenangebote/detail/a4997de7-78b3-4826-91dc-52ac527b4db2/'),
  'https://www.jobs.ch/de/stellenangebote/detail/a4997de7-78b3-4826-91dc-52ac527b4db2/',
  'Une adresse sans schéma doit recevoir https://'
);

// Adresse commençant par //
assert.strictEqual(
  normalizeJobUrl('//www.jobup.ch/fr/emplois/detail/12345/'),
  'https://www.jobup.ch/fr/emplois/detail/12345/',
  'Une adresse commençant par // doit recevoir https:'
);

// Adresse avec http://
assert.strictEqual(
  normalizeJobUrl('http://127.0.0.1:4567/form'),
  'http://127.0.0.1:4567/form',
  'Une adresse http:// valide doit être conservée'
);

// Adresse avec https://
assert.strictEqual(
  normalizeJobUrl('https://www.jobup.ch/fr/emplois/detail/abc/'),
  'https://www.jobup.ch/fr/emplois/detail/abc/',
  'Une adresse https:// valide doit être conservée'
);

// Adresse vide ou nulle
assert.strictEqual(normalizeJobUrl(''), '', 'Chaîne vide -> vide');
assert.strictEqual(normalizeJobUrl('   '), '', 'Espaces seuls -> vide');
assert.strictEqual(normalizeJobUrl(null), '', 'null -> vide');
assert.strictEqual(normalizeJobUrl(undefined), '', 'undefined -> vide');

// Protocoles non HTTP/HTTPS ou adresses invalides rejetés proprement
assert.strictEqual(normalizeJobUrl('javascript:alert(1)'), '', 'javascript: doit être rejeté');
assert.strictEqual(normalizeJobUrl('mailto:rh@entreprise.ch'), '', 'mailto: doit être rejeté');
assert.strictEqual(normalizeJobUrl('ftp://files.entreprise.ch/cv'), '', 'ftp: doit être rejeté');
assert.strictEqual(normalizeJobUrl('not a valid url at all'), '', 'Texte invalide avec espaces doit être rejeté');
assert.strictEqual(normalizeJobUrl('invalid_host_without_dot'), '', 'Hôte sans domaine ni localhost doit être rejeté');

// originPortal avec URL sans schéma
assert.strictEqual(
  originPortal('www.jobs.ch/de/stellenangebote/detail/a4997de7/'),
  'Jobs.ch',
  'originPortal doit reconnaître Jobs.ch même sur une URL sans schéma'
);

// extractJobRoomAd avec externalUrl sans schéma
const extractedAd = extractJobRoomAd({
  id: 'jr-test-1',
  jobContent: {
    externalUrl: 'www.jobs.ch/de/stellenangebote/detail/a4997de7/',
    jobDescriptions: [{ languageIsoCode: 'fr', title: 'Cuisinier en diététique', description: 'Poste à Lausanne' }],
    company: { name: 'Clinique Test' },
    locations: [{ city: 'Lausanne', cantonCode: 'VD' }]
  }
});
assert.strictEqual(
  extractedAd?.url,
  'https://www.jobs.ch/de/stellenangebote/detail/a4997de7/',
  'extractJobRoomAd doit normaliser externalUrl avec https://'
);
console.log('  ✓ normalizeJobUrl, originPortal et extractJobRoomAd validés');

// ─────────────────────────────────────────────────────────────────────────────
// PARTIE 2 : Tests Playwright de bout en bout sur serveur local
// ─────────────────────────────────────────────────────────────────────────────
let postSubmissions = 0;
let formPageLoads = 0;
let serverPort = 0;

const testServer = http.createServer((req, res) => {
  const url = req.url || '/';

  if (req.method === 'POST') {
    postSubmissions++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body><h1>Candidature envoyée avec succès</h1></body></html>');
    return;
  }

  // Page 1 : Annonce menant au formulaire via lien / redirection dans le même onglet
  if (url === '/ad-same-tab') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Annonce Emploi — Même Onglet</title></head>
<body>
  <h1>Chef de Projet Digital (H/F)</h1>
  <p>Description complète du poste.</p>
  <a href="/application-form" data-cy="apply-button">Postuler maintenant</a>
</body>
</html>`);
    return;
  }

  // Page 2 : Annonce avec modale type JobCloud (« Continuer sans compte ») ouvrant le formulaire dans un NOUVEL ONGLET
  if (url === '/ad-new-tab') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Annonce Portail — Nouvel Onglet</title></head>
<body>
  <h1>Ingénieur Logiciel Senior</h1>
  <button type="button" data-cy="apply-button-external" onclick="document.getElementById('login-wall').style.display='block'">Bewerben</button>
  <div id="login-wall" style="display:none">
    <button type="button" data-cy="login-wall-modal-modal-primary">Konto erstellen</button>
    <button type="button" data-cy="login-wall-modal-modal-secondary" onclick="window.open('/application-form', '_blank')">Weiter ohne Konto</button>
  </div>
</body>
</html>`);
    return;
  }

  // Page 3 : Formulaire de candidature réel
  if (url === '/application-form') {
    formPageLoads++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Formulaire de candidature</title></head>
<body>
  <h1>Postuler à cette offre</h1>
  <form method="POST" action="/submit" enctype="multipart/form-data">
    <input type="text" name="firstname" placeholder="Prénom" />
    <input type="text" name="lastname" placeholder="Nom" />
    <input type="email" name="email" placeholder="Email" />
    <input type="tel" name="phone" placeholder="Téléphone" />
    <input type="file" name="cv" accept=".pdf" />
    <input type="checkbox" name="privacy" />
    <button type="submit">Envoyer ma candidature</button>
  </form>
</body>
</html>`);
    return;
  }

  // Page 4 : Annonce menant vers un mur de connexion obligatoire (login wall)
  if (url === '/ad-login-blocked') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Annonce avec connexion requise</title></head>
<body>
  <h1>Cuisinier en diététique</h1>
  <a href="/login-gate">postuler</a>
</body>
</html>`);
    return;
  }

  if (url === '/login-gate') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>Clinique | Connexion</title></head>
<body>
  <h1>Se connecter / Créer un compte</h1>
  <form method="POST" action="/login">
    <input type="text" name="Email" id="Email" />
    <input type="password" name="Password" id="Password" />
    <button type="submit">se connecter</button>
  </form>
</body>
</html>`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<html><body><h1>404 Offre expirée</h1></body></html>');
});

await new Promise<void>((resolve) => {
  testServer.listen(0, '127.0.0.1', () => {
    const addr = testServer.address();
    serverPort = typeof addr === 'object' && addr ? addr.port : 0;
    resolve();
  });
});

const profile = {
  first_name: 'Jean',
  last_name: 'Desfontaines',
  email: 'jean.desfontaines@example.ch',
  phone: '+41 79 123 45 67',
  privacy_consent: true,
  wanted_cantons: ['GE', 'VD'],
  cv_filename: 'CV_Jean_Test_Normalize.pdf',
  cv_path: baseCvPath
};

writeTable('user_profile', [profile]);
writeTable('jobs', [
  {
    id: 501,
    title: 'Chef de Projet Digital',
    company: 'Romandie Digital SA',
    canton: 'VD',
    status: 'À postuler',
    url: `http://127.0.0.1:${serverPort}/ad-same-tab`
  },
  {
    id: 502,
    title: 'Ingénieur Logiciel Senior',
    company: 'Helvetia Tech AG',
    canton: 'GE',
    status: 'À postuler',
    url: `http://127.0.0.1:${serverPort}/ad-new-tab`
  },
  {
    id: 503,
    title: 'Cuisinier en diététique',
    company: 'Clinique Test',
    canton: 'VD',
    status: 'À postuler',
    url: `http://127.0.0.1:${serverPort}/ad-login-blocked`
  },
  {
    id: 504,
    title: 'Offre URL Invalide',
    company: 'Invalid Corp',
    canton: 'GE',
    status: 'À postuler',
    url: 'javascript:alert(1)'
  }
]);

for (const t of ['applications', 'settings', 'cv_variants', 'scraping_logs', 'scraping_tasks', 'cart']) {
  writeTable(t, []);
}

try {
  // Cas A : Annonce menant au formulaire (même onglet) en mode simulate: true
  console.log('\n--- 2. Annonce menant au formulaire (même onglet) en mode simulate: true ---');
  postSubmissions = 0;
  formPageLoads = 0;
  const resSameTab = await engine.applyToJob(501, { headless: true, simulate: true });
  assert.strictEqual(resSameTab.success, true, 'Essai annonce -> formulaire (même onglet) doit réussir');
  assert.strictEqual(resSameTab.automation_result?.status, 'simulated');
  assert.ok(formPageLoads > 0, 'La page du formulaire doit avoir été atteinte');
  assert.ok(resSameTab.automation_result?.details?.fieldsFilled?.includes('firstname'));
  assert.ok(resSameTab.automation_result?.details?.fieldsFilled?.includes('cv_upload'));
  assert.strictEqual(postSubmissions, 0, 'Zéro soumission POST en simulation');
  console.log('  ✓ Transition annonce -> formulaire (même onglet) + remplissage + CV sans envoi validés');

  // Cas B : Annonce ouvrant le formulaire dans un NOUVEL ONGLET (avec modale « Weiter ohne Konto ») en mode simulate: true
  console.log('\n--- 3. Annonce ouvrant le formulaire dans un nouvel onglet en mode simulate: true ---');
  postSubmissions = 0;
  formPageLoads = 0;
  const resNewTab = await engine.applyToJob(502, { headless: true, simulate: true });
  assert.strictEqual(resNewTab.success, true, 'Essai annonce -> nouvel onglet doit réussir');
  assert.strictEqual(resNewTab.automation_result?.status, 'simulated');
  assert.ok(formPageLoads > 0, 'Le formulaire dans le nouvel onglet doit avoir été chargé');
  assert.ok(resNewTab.automation_result?.details?.fieldsFilled?.includes('firstname'));
  assert.ok(resNewTab.automation_result?.details?.fieldsFilled?.includes('lastname'));
  assert.ok(resNewTab.automation_result?.details?.fieldsFilled?.includes('email'));
  assert.ok(resNewTab.automation_result?.details?.fieldsFilled?.includes('cv_upload'));
  assert.strictEqual(postSubmissions, 0, 'Zéro soumission POST dans le nouvel onglet en simulation');
  console.log('  ✓ Transition annonce -> modale sans compte -> nouvel onglet + remplissage + CV sans envoi validés');

  // Cas C : Blocage explicite (mur de connexion / compte requis) -> arrêt propre avec motif exact et success: false
  console.log('\n--- 4. Blocage explicite (connexion / compte requis) ---');
  postSubmissions = 0;
  const resBlocked = await engine.applyToJob(503, { headless: true, simulate: true });
  assert.strictEqual(resBlocked.success, false, 'Un essai bloqué par un mur de connexion ne doit pas être un succès');
  assert.strictEqual(resBlocked.automation_result?.status, 'requires_review');
  assert.strictEqual(resBlocked.display_status, 'a_verifier');
  assert.ok(
    resBlocked.automation_result?.message?.includes('Compte ou authentification utilisateur requis'),
    `Motif attendu sur le compte requis, reçu : ${resBlocked.automation_result?.message}`
  );
  assert.strictEqual(postSubmissions, 0, 'Zéro soumission POST sur un mur de connexion');
  console.log('  ✓ Blocage connexion détecté proprement avec motif exact et sans soumission');

  // Cas D : Adresse invalide (protocole javascript:) -> rejetée proprement avec status: 'error'
  console.log('\n--- 5. Rejet propre d’une adresse invalide ---');
  const resInvalidUrl = await runPlaywrightApplication(
    { id: 504, title: 'Offre URL Invalide', url: 'javascript:alert(1)' },
    profile,
    {},
    { headless: true, simulate: true, cvPath: baseCvPath }
  );
  assert.strictEqual(resInvalidUrl.status, 'error');
  assert.ok(resInvalidUrl.message.includes('invalide ou protocole non supporté'));
  console.log('  ✓ Adresse invalide rejetée proprement avant navigation');

  // Contrôle qu'aucune ligne n'a été créée dans applications en mode simulation
  const apps = readTable('applications') as unknown[];
  assert.strictEqual(apps.length, 0, 'Aucune ligne dans applications après les essais');

  // Contrôle d'isolation des vrais dossiers
  const realDataAfter = fs.existsSync(realDataDir) ? fs.readdirSync(realDataDir) : [];
  const realUploadsAfter = fs.existsSync(realUploadsDir) ? fs.readdirSync(realUploadsDir) : [];
  assert.deepStrictEqual(realDataBefore, realDataAfter, 'Le vrai dossier data/ est intact');
  assert.deepStrictEqual(realUploadsBefore, realUploadsAfter, 'Le vrai dossier uploads/ est intact');
  console.log('  ✓ Isolation des vrais dossiers data/ et uploads/ respectée');
} finally {
  testServer.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : NORMALISATION URL & PARCOURS ESSAI DE BOUT EN BOUT VALIDÉS');
console.log('========================================================================\n');
