import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import {
  cleanJobTitleForExclusion,
  getDistinctiveShortcut,
  checkRoleConflict
} from '../src/services/exclusionMatcher.ts';
import { evaluateJobFilters } from '../src/services/jobFilterEngine.ts';

console.log('=== TEST SUITE : Parcours Fonction 1 (Croix « Pas intéressé », Exclusion Titre & Réversibilité) ===\n');

// 1. Isolation complète : répertoires temporaires dédiés
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-cross-test-'));
const testDataDir = path.join(tmpDir, 'data');
const testUploadsDir = path.join(tmpDir, 'uploads');
fs.mkdirSync(testDataDir, { recursive: true });
fs.mkdirSync(testUploadsDir, { recursive: true });

process.env.JOBPILOT_DATA_DIR = testDataDir;
process.env.JOBPILOT_UPLOADS_DIR = testUploadsDir;

// Écriture des données initiales isolées
const initialJobs = [
  {
    id: 101,
    title: 'Vendeur / vendeuse en boulangerie 80-100% (h/f/d)',
    company: 'Boulangerie Artisanale SA',
    canton: 'GE',
    workload: '80-100%',
    description: 'Vente de pains, viennoiseries et service client au comptoir.'
  },
  {
    id: 102,
    title: 'Senior Account Executive Enterprise B2B',
    company: 'Tech SaaS Geneva',
    canton: 'GE',
    workload: '100%',
    description: 'Gestion de grands comptes et closing commercial B2B.'
  },
  {
    id: 103,
    title: 'Cuisinier·ère en diététique 100% (f/h)',
    company: 'Clinique Santé',
    canton: 'VD',
    workload: '100%',
    description: 'Préparation des repas de régime.'
  }
];

const initialProfile = [
  {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    current_title: 'Senior Account Executive',
    wanted_roles: ['Account Executive', 'Key Account Manager'],
    wanted_cantons: ['GE', 'VD'],
    excluded_roles: [],
    // Note : enable_relevance_matching non défini -> doit être désactivé par défaut
  }
];

fs.writeFileSync(path.join(testDataDir, 'jobs.json'), JSON.stringify(initialJobs, null, 2));
fs.writeFileSync(path.join(testDataDir, 'user_profile.json'), JSON.stringify(initialProfile, null, 2));

// Imports dynamiques après positionnement des variables d'environnement
const express = (await import('express')).default;
const jobsRouter = (await import('../server/routes/jobs.ts')).default;
const profileRouter = (await import('../server/routes/profile.ts')).default;
const { readTable } = await import('../server/db.ts');

const app = express();
app.use(express.json());
app.use(jobsRouter);
app.use(profileRouter);

let server: http.Server | undefined;
let apiPort = 0;

try {
  await new Promise<void>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      server = s;
      const addr = s.address() as any;
      apiPort = addr.port;
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 1 : Nettoyage préalable du titre (sans taux ni h/f) et raccourcissement
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('--- Étape 1 : Nettoyage du titre avant exclusion ---');
  const rawTitle = initialJobs[0].title;
  const cleanedTitle = cleanJobTitleForExclusion(rawTitle);
  assert.strictEqual(
    cleanedTitle,
    'Vendeur / vendeuse en boulangerie',
    'Le titre prérempli doit être purgé du taux 80-100% et du marqueur (h/f/d)'
  );
  console.log(`  ✓ Titre brut     : « ${rawTitle} »`);
  console.log(`  ✓ Titre prérempli: « ${cleanedTitle} »`);

  // L'utilisateur peut raccourcir le terme prérempli :
  const shortenedRule = 'vendeur boulangerie';
  console.log(`  ✓ Raccourci saisi: « ${shortenedRule} »`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 2 : Situation initiale -> les 3 offres sont retenues (actives)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 2 : État initial des offres ---');
  const resInit = await fetch(`${baseUrl}/api/jobs?view=active`);
  const jobsInit: any[] = await resInit.json();
  assert.strictEqual(jobsInit.length, 3, 'Toutes les offres initiales doivent être actives');
  console.log('  ✓ Les 3 offres sont visibles dans la liste Retenues');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 3 : Clic sur la croix -> Ajout du rôle exclu via POST /api/profile/exclude-role
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 3 : Clic sur la croix et exclusion du titre ---');
  const resExclude = await fetch(`${baseUrl}/api/profile/exclude-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: shortenedRule })
  });
  const dataExclude: any = await resExclude.json();

  assert.strictEqual(resExclude.status, 200, 'L’appel exclude-role doit réussir avec code 200');
  assert.strictEqual(dataExclude.success, true);
  assert.ok(dataExclude.excluded_roles.includes(shortenedRule), 'Le rôle doit figurer dans excluded_roles');
  console.log(`  ✓ « ${shortenedRule} » ajouté au profil via l’API`);

  // Vérification de la persistance dans user_profile.json
  const savedProfile = readTable('user_profile')[0];
  assert.ok(
    savedProfile.excluded_roles?.includes(shortenedRule),
    'La règle doit être persistée physiquement dans user_profile.json'
  );
  console.log('  ✓ Règle visible et persistée dans le profil (« Ce que je ne veux pas »)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 4 : L'offre disparaît de « Retenues » et passe dans « Exclues »
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 4 : Vérification du masquage et du motif ---');
  const resActiveAfter = await fetch(`${baseUrl}/api/jobs?view=active`);
  const activeJobsAfter: any[] = await resActiveAfter.json();

  // L'offre de boulangerie ne doit plus être dans les offres actives
  const foundInActive = activeJobsAfter.some(j => j.id === 101);
  assert.strictEqual(foundInActive, false, 'L’offre 101 doit avoir disparu de la vue active');
  assert.strictEqual(activeJobsAfter.length, 2, 'Il ne reste que 2 offres actives');
  console.log('  ✓ L’offre a disparu de la liste active');

  // L'offre apparaît dans « Exclues »
  const resExcludedAfter = await fetch(`${baseUrl}/api/jobs?view=excluded`);
  const excludedJobsAfter: any[] = await resExcludedAfter.json();
  const foundInExcluded = excludedJobsAfter.find(j => j.id === 101);

  assert.ok(foundInExcluded, 'L’offre 101 doit être présente dans la vue Exclues');
  assert.strictEqual(foundInExcluded.is_excluded, true);
  assert.ok(
    foundInExcluded.exclusion_reason?.includes(shortenedRule),
    'Le motif d’exclusion doit citer la règle explicite'
  );
  console.log(`  ✓ L’offre est passée dans « Exclues » avec son motif : « ${foundInExcluded.exclusion_reason} »`);

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 5 : Annulation / Suppression de la règle -> Réapparition immédiate
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 5 : Annulation (Undo) ou suppression de la règle dans le profil ---');
  const resUnexclude = await fetch(`${baseUrl}/api/profile/unexclude-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: shortenedRule })
  });
  const dataUnexclude: any = await resUnexclude.json();

  assert.strictEqual(resUnexclude.status, 200);
  assert.strictEqual(dataUnexclude.success, true);
  assert.strictEqual(dataUnexclude.excluded_roles.includes(shortenedRule), false);
  console.log(`  ✓ « ${shortenedRule} » retiré du profil`);

  // Vérification de la réapparition dans « Retenues »
  const resActiveFinal = await fetch(`${baseUrl}/api/jobs?view=active`);
  const activeJobsFinal: any[] = await resActiveFinal.json();

  const foundInActiveFinal = activeJobsFinal.find(j => j.id === 101);
  assert.ok(foundInActiveFinal, 'L’offre 101 doit réapparaître immédiatement dans la vue active');
  assert.strictEqual(foundInActiveFinal.is_excluded, false);
  assert.strictEqual(activeJobsFinal.length, 3, 'Les 3 offres sont de nouveau actives');
  console.log('  ✓ Réversibilité prouvée : l’offre réapparaît immédiatement dans la liste Retenues');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 6 : Désactivation par défaut du filtre de pertinence métier
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 6 : Contrôle de désactivation par défaut de la pertinence ---');
  const jobCook = initialJobs[2]; // Cuisinier·ère en diététique

  // Avec le profil par défaut (sans enable_relevance_matching) :
  const defaultEval = evaluateJobFilters(jobCook, savedProfile);
  assert.strictEqual(
    defaultEval.isExcluded,
    false,
    'Par défaut, une offre sans lien de compétences ne doit PAS être exclue'
  );
  console.log('  ✓ Par défaut : Cuisinier n’est PAS exclu (filtre de pertinence inactif par défaut)');

  // Avec activation explicite dans le profil :
  const strictProfile = { ...savedProfile, enable_relevance_matching: true };
  const strictEval = evaluateJobFilters(jobCook, strictProfile);
  assert.strictEqual(
    strictEval.isExcluded,
    true,
    'Avec enable_relevance_matching = true, Cuisinier doit être exclu'
  );
  assert.ok(strictEval.matchedExclusions.includes('relevance:no_profile_match'));
  console.log('  ✓ Sur option activée dans le profil : Cuisinier est exclu avec motif explicite');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 7 : Tests du vrai raccourci distinctif (getDistinctiveShortcut)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 7 : Raccourcis distinctifs sur les titres réels ---');
  assert.strictEqual(
    getDistinctiveShortcut('Vendeur / vendeuse en boulangerie 80-100% (h/f/d)'),
    'vendeur boulangerie'
  );
  assert.strictEqual(
    getDistinctiveShortcut('Cuisinier·ère en diététique 100% (f/h)'),
    'cuisinier dietetique'
  );
  assert.strictEqual(
    getDistinctiveShortcut('Senior Account Executive Enterprise B2B'),
    'senior account'
  );
  console.log('  ✓ getDistinctiveShortcut extrait fidèlement les 2 mots distinctifs (ex: « vendeur boulangerie »)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 8 : Avertissement si la règle recoupe wanted_roles ou current_title
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 8 : Détection de recoupement avec poste ciblé ou actuel ---');
  const conflictRole = checkRoleConflict('account executive', savedProfile);
  assert.strictEqual(conflictRole.hasConflict, true);
  assert.ok(conflictRole.conflictedWith?.includes('Senior Account Executive') || conflictRole.conflictedWith?.includes('Account Executive'));
  console.log(`  ✓ Conflit détecté avec le profil : ${conflictRole.conflictedWith}`);

  const noConflict = checkRoleConflict('vendeur boulangerie', savedProfile);
  assert.strictEqual(noConflict.hasConflict, false);
  console.log('  ✓ Aucun faux conflit pour un métier tiers (« vendeur boulangerie »)');

  // ─────────────────────────────────────────────────────────────────────────────
  // Étape 9 : Règle déjà présente dans excluded_roles -> Annuler ne retire rien
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Étape 9 : Règle déjà présente dans excluded_roles ---');
  // Premier ajout de « cuisinier »
  const resFirstAdd = await fetch(`${baseUrl}/api/profile/exclude-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'cuisinier' })
  });
  const dataFirstAdd: any = await resFirstAdd.json();
  assert.strictEqual(dataFirstAdd.already_existed, false);

  // Deuxième tentative d'ajout de « cuisinier »
  const resSecondAdd = await fetch(`${baseUrl}/api/profile/exclude-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'cuisinier' })
  });
  const dataSecondAdd: any = await resSecondAdd.json();
  assert.strictEqual(dataSecondAdd.already_existed, true, 'already_existed doit valoir true');
  assert.strictEqual(dataSecondAdd.message, 'règle déjà présente', 'Le message doit être « règle déjà présente »');
  console.log('  ✓ Règle déjà existante : API renvoie already_existed=true et message « règle déjà présente »');

  // Si la règle existait déjà, l'opération Annuler côté client ne doit rien retirer
  const profileAfterDup = readTable('user_profile')[0];
  assert.ok(profileAfterDup.excluded_roles?.includes('cuisinier'), 'La règle doit rester présente');
  console.log('  ✓ Règle confirmée intacte dans excluded_roles');

} finally {
  if (server) {
    server.close();
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================================================');
console.log('SUCCÈS : PARCOURS COMPLET DE LA FONCTION 1 VALIDÉ SANS ERREUR !');
console.log('========================================================================\n');
