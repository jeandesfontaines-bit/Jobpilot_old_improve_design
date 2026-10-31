import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('=== TEST SUITE : Garde-fous d’envoi (verrou, soumise sans confirmation, repli navigateur) ===');

// Isolation complète : dossiers temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-safety-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
const testScreenshotsDir = path.join(tmpDir, 'screenshots');
for (const dir of [testDataDir, testUploadsDir, testScreenshotsDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;
process.env.JOBPILOT_SCREENSHOTS_DIR = testScreenshotsDir;

const writeTable = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(testDataDir, `${name}.json`), JSON.stringify(data, null, 2));
};

writeTable('user_profile', [
  { first_name: 'Jean', last_name: 'Test', email: 'jean@test.ch', privacy_consent: true }
]);
writeTable('jobs', [
  { id: 201, title: 'Key Account Manager', company: 'Alpha SA', canton: 'GE', status: 'À postuler', url: 'http://127.0.0.1:9/never-called' },
  { id: 202, title: 'Account Executive', company: 'Beta SA', canton: 'VD', status: 'À postuler', url: 'http://127.0.0.1:9/never-called' }
]);
writeTable('applications', [
  { id: 1, job_id: 201, title: 'Key Account Manager', status: 'À vérifier', submitted_unconfirmed: true }
]);
for (const table of ['settings', 'cv_variants', 'scraping_logs', 'scraping_tasks', 'cart']) {
  writeTable(table, []);
}

const engine = await import('../server/services/applicationEngine.ts');
const { readTable } = await import('../server/db.ts');

try {
  console.log('\n--- Test 1 : offre déjà soumise sans confirmation -> refusée, rien n’est lancé ---');
  const r1 = await engine.applyToJob(201);
  assert.strictEqual(r1.refused, true, 'L’offre soumise sans confirmation doit être refusée');
  assert.strictEqual(r1.display_status, 'a_verifier');
  assert.ok(r1.error?.includes('déjà été soumis'), 'Le message doit expliquer pourquoi');
  assert.deepStrictEqual(fs.readdirSync(testUploadsDir), [], 'Aucun CV ne doit être généré');
  const appsAfter = readTable('applications');
  assert.strictEqual(appsAfter.length, 1, 'Aucune candidature ne doit être ajoutée');
  assert.strictEqual(appsAfter[0].status, 'À vérifier', 'Le statut existant reste inchangé');
  assert.strictEqual(engine.tryAcquireJobLock(201), true, 'Le verrou doit être libéré après un refus');
  engine.releaseJobLock(201);
  console.log('  ✓ Refus propre, aucun CV généré, aucun navigateur ouvert, verrou libéré');

  console.log('\n--- Test 2 : verrou par offre (envoi déjà en cours) ---');
  assert.strictEqual(engine.tryAcquireJobLock(202), true);
  assert.strictEqual(engine.tryAcquireJobLock(202), false, 'Un deuxième verrou sur la même offre doit échouer');
  const r2 = await engine.applyToJob(202);
  assert.strictEqual(r2.refused, true);
  assert.ok(r2.error?.includes('déjà en cours'));
  assert.deepStrictEqual(fs.readdirSync(testUploadsDir), [], 'Aucun CV ne doit être généré');
  engine.releaseJobLock(202);
  assert.strictEqual(engine.tryAcquireJobLock(202), true, 'Le verrou doit pouvoir être repris après libération');
  engine.releaseJobLock(202);
  console.log('  ✓ Un deuxième lancement sur la même offre est refusé tant que le premier n’est pas terminé');

  console.log('\n--- Test 3 : détection « formulaire soumis sans confirmation » ---');
  const submittedNoProof = {
    status: 'requires_review',
    details: { actionLogs: ['Navigating to target URL: x', 'Clicked submit button via selector button[type=submit] -> Success'] }
  };
  assert.strictEqual(engine.isSubmittedUnconfirmed(submittedNoProof), true);
  const uploadFailed = {
    status: 'requires_review',
    details: { actionLogs: ['CV upload not confirmed on page x. Halting submission -> requires_review.'] }
  };
  assert.strictEqual(engine.isSubmittedUnconfirmed(uploadFailed), false, 'Un blocage avant envoi n’est pas une soumission');
  const reallySent = {
    status: 'sent',
    details: { actionLogs: ['Clicked submit button via selector button[type=submit] -> Success'] }
  };
  assert.strictEqual(engine.isSubmittedUnconfirmed(reallySent), false, 'Une candidature confirmée n’est pas « à confirmer »');
  console.log('  ✓ Soumise sans confirmation : détectée ; blocage avant envoi et envoi confirmé : non');

  console.log('\n--- Test 4 : le repli « navigateur indisponible » ne produit jamais un faux sent hors test ---');
  const fallbackSent = {
    status: 'sent',
    message: 'Candidature envoyée avec succès.',
    details: {
      fieldsFilled: ['firstname', 'cv_upload'],
      missingFields: [],
      unknownQuestions: [],
      captchaDetected: false,
      confirmationVerified: true,
      actionLogs: ['Browser launch fallback triggered: executable missing']
    }
  };
  const inProduction = engine.rejectBrowserFallback(fallbackSent, 'production');
  assert.strictEqual(inProduction.status, 'error', 'Hors test, le repli doit devenir une erreur');
  assert.strictEqual(inProduction.details.confirmationVerified, false);
  assert.ok(String(inProduction.message).includes('Navigateur Playwright indisponible'));
  const inTest = engine.rejectBrowserFallback(fallbackSent, 'test');
  assert.strictEqual(inTest.status, 'sent', 'En test, le comportement existant est conservé');
  const normalResult = { status: 'sent', details: { actionLogs: ['Uploaded exact CV file -> Success'] } };
  assert.strictEqual(engine.rejectBrowserFallback(normalResult, 'production'), normalResult, 'Un résultat normal est renvoyé tel quel');
  console.log('  ✓ Hors test : repli rejeté (erreur) ; en test : inchangé ; résultat normal : inchangé');
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : LES GARDE-FOUS D’ENVOI SONT VALIDÉS');
console.log('========================================================================\n');
