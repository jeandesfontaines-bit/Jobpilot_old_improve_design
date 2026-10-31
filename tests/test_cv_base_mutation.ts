import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

console.log('=== TEST SUITE : CV de Base Mutation & Contrat Réel HTTP (Point 4) ===');

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-cv-mutation-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testUploadsDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;

// Profil initial dans le répertoire temporaire isolé
const initialProfile = {
  first_name: 'Jean',
  last_name: 'Desfontaines',
  email: 'jean.desfontaines@me.com',
  cv_filename: 'cv_initial_existant.pdf',
  cv_path: path.join(testUploadsDir, 'cv_initial_existant.pdf'),
  wanted_cantons: ['GE', 'VD']
};
fs.writeFileSync(path.join(testDataDir, 'user_profile.json'), JSON.stringify([initialProfile], null, 2));
fs.writeFileSync(path.join(testDataDir, 'cv_variants.json'), JSON.stringify([], null, 2));

// Import dynamique pour garantir la prise en compte immédiate des variables d'environnement
const express = (await import('express')).default;
const { readTable } = await import('../server/db.ts');
const cvsRouter = (await import('../server/routes/cvs.ts')).default;

const app = express();
app.use(express.json());
app.use(cvsRouter);

let server: http.Server = null as any;
const port = await new Promise<number>((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    const addr = server.address() as any;
    resolve(addr.port);
  });
});

try {
  // 2. Préparation d’un fichier CV existant uniquement dans le dossier temporaire
  const testCvName = 'test_cv_base_verif.pdf';
  const testCvPath = path.join(testUploadsDir, testCvName);
  fs.writeFileSync(testCvPath, '%PDF-1.4 Valid PDF content for unit testing');
  console.log('  ✓ Fichier de test isolé préparé dans le dossier temporaire :', testCvName);

  // 3. Appel réel HTTP POST /api/cvs/:id/set-base pour un fichier existant
  const resValid = await fetch(`http://127.0.0.1:${port}/api/cvs/test_cv_base_verif/set-base`, {
    method: 'POST'
  });
  const dataValid = await resValid.json();

  assert.strictEqual(resValid.status, 200, 'La réponse HTTP doit être 200 OK');
  assert.strictEqual(dataValid.success, true, 'dataValid.success doit être true');
  assert.strictEqual(dataValid.base_cv, testCvName, 'base_cv doit correspondre au fichier demandé');

  // Relecture indépendante du profil utilisateur dans la table isolée
  const profileAfterValid = readTable('user_profile')[0] || {};
  assert.strictEqual(profileAfterValid.cv_filename, testCvName, 'cv_filename doit être mis à jour dans le profil');
  assert.strictEqual(profileAfterValid.cv_path, testCvPath, 'cv_path doit correspondre au chemin temporaire');
  assert.ok(fs.existsSync(profileAfterValid.cv_path), 'Le fichier sélectionné existe physiquement');
  console.log('  ✓ Appel réel POST /api/cvs/:id/set-base réussi (200 OK), profil synchronisé et vérifié');

  // 4. Appel réel HTTP POST /api/cvs/:id/set-base pour un fichier ABSENT
  const nonExistentCvId = 'fichier_fantome_qui_n_existe_pas_9999';
  const resMissing = await fetch(`http://127.0.0.1:${port}/api/cvs/${nonExistentCvId}/set-base`, {
    method: 'POST'
  });
  const dataMissing = await resMissing.json();

  assert.strictEqual(resMissing.status, 404, 'La réponse HTTP pour un fichier absent doit être 404 Not Found');
  assert.strictEqual(dataMissing.success, false, 'dataMissing.success doit être false');
  assert.ok(dataMissing.error?.includes('introuvable'), 'Un message d’erreur clair doit être retourné');

  // Vérification que le profil est STRICTEMENT INCHANGÉ
  const profileAfterMissing = readTable('user_profile')[0] || {};
  assert.strictEqual(profileAfterMissing.cv_filename, testCvName, 'Le profil ne doit pas être modifié lors d’une erreur 404');
  assert.strictEqual(profileAfterMissing.cv_path, testCvPath, 'Le chemin cv_path reste inchangé');
  console.log('  ✓ Appel réel POST avec fichier absent rejeté (404 Not Found), profil STRICTEMENT inchangé');

} finally {
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : APPELS RÉELS POST ET ISOLATION DU PROFIL VALIDÉS !');
console.log('========================================================================\n');
