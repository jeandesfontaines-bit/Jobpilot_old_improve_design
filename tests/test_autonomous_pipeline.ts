import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  detectJobChannel,
  generateTailoredLetter,
  evaluateJobEligibility,
  initAutonomousPipeline,
  getPipelineStatus,
  runAutonomousCycle,
  togglePipeline,
  migrateSettings,
  resolveCvFile
} from '../src/services/autonomousPipeline';
import { getZurichDateString, formatZurichDateTime, isSameZurichCalendarDay } from '../src/services/zurichTime';
import { Job, UserProfile, Settings, Application } from '../src/types';

async function runTests() {
  console.log('=== TEST SUITE : Pipeline Autonome JobPilot (Simulation, Quotas Zurich & Robustesse) ===');

  // ==========================================
  // 1. Tests Fuseau Horaire Europe/Zurich
  // ==========================================
  console.log('1. Tests Jour Civil Europe/Zurich...');
  
  // Test a summer/autumn UTC time near midnight: 2026-10-21T23:30:00Z is 2026-10-22T01:30:00 CEST (UTC+2)
  const utcLateEvening = new Date('2026-10-21T23:30:00Z');
  const zurichDateLate = getZurichDateString(utcLateEvening);
  assert.equal(zurichDateLate, '2026-10-22', 'Le jour civil à 23h30 UTC doit être le 22 octobre en heure de Zurich (CEST)');

  // Test afternoon same day
  const utcMorning = new Date('2026-10-22T10:00:00Z');
  const zurichDateMorning = getZurichDateString(utcMorning);
  assert.equal(zurichDateMorning, '2026-10-22');

  assert.equal(isSameZurichCalendarDay(utcLateEvening, utcMorning), true, 'Deux horodatages dans le même jour civil Zurich');
  console.log('  ✓ Jour civil Europe/Zurich calculé avec précision (indépendant des 24h glissantes)');

  // ==========================================
  // 2. Tests Migration des Réglages
  // ==========================================
  console.log('2. Tests Migration et Rétrocompatibilité des Réglages...');

  const legacySettings = {
    auto_scrape_interval: 20,
    daily_application_limit: 8
  };
  const migrated = migrateSettings(legacySettings);
  assert.equal(migrated.interval_minutes, 60, 'interval_minutes fixé à 60 min au minimum');
  assert.equal(migrated.auto_scrape_interval, 0, 'auto_scrape_interval fixé à 0 (manuel uniquement)');
  assert.equal(migrated.daily_submission_quota, 8, 'daily_application_limit migré vers daily_submission_quota');
  assert.equal(migrated.max_candidates_per_cycle, 2, 'max_candidates_per_cycle par défaut à 2');
  assert.equal(migrated.scheduler_mode, 'simulation', 'Mode verrouillé en simulation');
  assert.equal(migrated.simulation_mode, true, 'simulation_mode: true');

  // Verification du verrouillage strict du mode simulation sans confirmation utilisateur explicite
  const realAttempt = migrateSettings({ scheduler_mode: 'real', simulation_mode: false });
  assert.equal(realAttempt.scheduler_mode, 'simulation', 'Le mode réel non autorisé est forcé en simulation');
  assert.equal(realAttempt.simulation_mode, true, 'simulation_mode forcé à true');
  console.log('  ✓ Migration des réglages et verrou de simulation validés');

  // ==========================================
  // 3. Tests Profil et Détection Dynamique du CV
  // ==========================================
  console.log('3. Tests Détection Dynamique du CV (zéro nom en dur)...');

  const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-cv-test-'));
  const testCvName = 'mon_cv_candidat_unique.pdf';
  const testCvPath = path.join(testTempDir, testCvName);

  const profileWithoutCv: UserProfile = {
    first_name: 'Jean',
    last_name: 'Desfontaines',
    email: 'jean@example.ch',
    phone: '+41 79 123 45 67',
    city: 'Genève',
    canton: 'GE',
    cv_filename: '',
    cover_template: 'standard',
    skills: ['React'],
    experiences: [],
    formations: [],
    languages: 'Français',
    wanted_roles: ['Account Executive'],
    wanted_cantons: ['GE'],
    remote_accepted: true,
    workload: '100%',
    salary_min: '120000',
    positive_keywords: [],
    negative_keywords: [],
    avoided_companies: []
  };

  const resEmpty = resolveCvFile(profileWithoutCv, testTempDir);
  assert.equal(resEmpty.exists, false, 'CV non configuré détecté');
  assert(resEmpty.errorReason?.includes('Aucun fichier CV configuré'), 'Message explicite pour CV non configuré');

  const profileWithMissingCv: UserProfile = {
    ...profileWithoutCv,
    cv_filename: 'cv_inexistant_sur_disque.pdf'
  };
  const resMissing = resolveCvFile(profileWithMissingCv, testTempDir);
  assert.equal(resMissing.exists, false, 'CV configuré mais absent du disque');
  assert(resMissing.errorReason?.includes('introuvable sur le disque'), 'Message explicite pour CV absent');

  // Create real file on disk
  fs.writeFileSync(testCvPath, '%PDF-1.4 simulated pdf test content');
  const profileWithValidCv: UserProfile = {
    ...profileWithoutCv,
    cv_filename: testCvName
  };
  const resValid = resolveCvFile(profileWithValidCv, testTempDir);
  assert.equal(resValid.exists, true, 'CV existant sur disque validé');
  assert.equal(resValid.filename, testCvName, 'Nom exact du CV extrait');
  console.log('  ✓ Détection physique du CV sur le disque validée (aucun nom en dur)');

  // ==========================================
  // 4. Tests Canaux & Rédaction Factuelle
  // ==========================================
  console.log('4. Tests Canaux et Rédaction Fondée sur le Parcours Réel...');

  const fullMockProfile: UserProfile = {
    ...profileWithValidCv,
    experiences: [
      {
        company: 'eEAT',
        title: 'Account manager',
        location: 'Suisse',
        start_date: '03/2022',
        end_date: '01/2025',
        realizations: ['Garanti un taux de rétention de 98 % sur 500+ clients'],
        achievements: ['Garanti un taux de rétention de 98 % sur 500+ clients']
      }
    ],
    formations: [
      {
        diploma: 'BTS Commerce',
        institution: 'Émile Dubois',
        location: 'France',
        start_date: '09/2010',
        end_date: '07/2012'
      }
    ],
    skills: ['Gestion de comptes', 'Salesforce'],
    wanted_roles: ['Account Executive'],
    wanted_cantons: ['GE', 'VD'],
    excluded_roles: ['stagiaire']
  };

  const jobEmail: Job = {
    id: 201,
    source: 'job_room',
    title: 'Account Executive B2B',
    company: 'TechCorp SA',
    location: 'Genève',
    canton: 'GE',
    remote: false,
    url: 'https://www.job-room.ch/job/201',
    description: 'Postulez directement par email à jobs@techcorp.ch avec dossier complet.',
    status: 'Nouvelle',
    score: 88
  };

  const detectedChannel = detectJobChannel(jobEmail);
  assert.equal(detectedChannel.channel, 'email');
  assert.equal(detectedChannel.target, 'jobs@techcorp.ch');

  const letter = generateTailoredLetter(jobEmail, fullMockProfile);
  assert(letter.includes('Jean Desfontaines'), 'Lettre contient le nom réel');
  assert(letter.includes('eEAT'), 'Lettre contient l’expérience réelle');
  assert(letter.includes('BTS Commerce'), 'Lettre contient le diplôme réel');
  assert(!letter.includes('Doctorat'), 'Aucune invention ou hallucination');
  console.log('  ✓ Rédaction factuelle sans invention validée');

  // ==========================================
  // 5. Test Cycle Autonome Isolé : Statut 'Simulé' et Traçabilité
  // ==========================================
  console.log('5. Tests Cycle Autonome en Simulation Exclusive...');

  const jobEligible1: Job = {
    id: 301,
    source: 'job_room',
    title: 'Account Executive',
    company: 'SwissCloud SA',
    location: 'Genève',
    canton: 'GE',
    remote: true,
    url: 'https://www.job-room.ch/301',
    description: 'Offre complète et détaillée pour un poste de Account Executive à Genève. Description longue de plus de soixante caractères.',
    status: 'Nouvelle',
    score: 90
  };

  const jobEligible2: Job = {
    id: 302,
    source: 'jobup_ch',
    title: 'Key Account Manager',
    company: 'VaudService SA',
    location: 'Lausanne',
    canton: 'VD',
    remote: false,
    url: 'https://www.jobup.ch/302',
    description: 'Offre complète et détaillée pour un poste de Key Account Manager à Lausanne. Description longue de plus de soixante caractères.',
    status: 'Nouvelle',
    score: 88
  };

  const jobEligible3: Job = {
    id: 303,
    source: 'jobup_ch',
    title: 'Customer Success Executive',
    company: 'GenevaTech SA',
    location: 'Genève',
    canton: 'GE',
    remote: true,
    url: 'https://www.jobup.ch/303',
    description: 'Offre complète et détaillée pour un poste de Customer Success Executive à Genève. Description longue de plus de soixante caractères.',
    status: 'Nouvelle',
    score: 85
  };

  const jobExcluded: Job = {
    id: 304,
    source: 'jobup_ch',
    title: 'Stagiaire Vente',
    company: 'Other SA',
    location: 'Genève',
    canton: 'GE',
    remote: false,
    url: 'https://www.jobup.ch/304',
    description: 'Stage pour étudiant.',
    status: 'Nouvelle',
    score: 95
  };

  const mockSettings: any = {
    positive_keywords: ['Account'],
    negative_keywords: [],
    interval_minutes: 60,
    max_candidates_per_cycle: 2, // Max 2 per cycle!
    daily_submission_quota: 5,  // Max 5 per Zurich day
    scheduler_active: true,
    scheduler_mode: 'simulation',
    simulation_mode: true
  };

  const store: Record<string, any[]> = {
    user_profile: [fullMockProfile],
    settings: [mockSettings],
    jobs: [jobEligible1, jobEligible2, jobEligible3, jobExcluded],
    cart: [
      { job_id: 304, title: jobExcluded.title, company: jobExcluded.company },
      { job_id: 301, title: jobEligible1.title, company: jobEligible1.company },
      { job_id: 302, title: jobEligible2.title, company: jobEligible2.company },
      { job_id: 303, title: jobEligible3.title, company: jobEligible3.company }
    ],
    applications: [],
    scraping_logs: []
  };

  const fakeCtx = {
    dataDir: testTempDir,
    readTable: (table: string) => store[table] || [],
    writeTable: async (table: string, data: any[]) => {
      store[table] = data;
      return true;
    },
    mutateTable: async (table: string, mutator: (data: any[]) => any[]) => {
      store[table] = mutator(store[table] || []);
      return { success: true, data: store[table] };
    }
  };

  initAutonomousPipeline(fakeCtx);

  // Execute 1st autonomous cycle (respecting cycle limit of 2)
  const report1 = await runAutonomousCycle(false);
  assert.equal(report1.submitted_simulated_count, 2, 'Cycle limité à max_candidates_per_cycle (2 candidatures)');
  assert(report1.blocked_count >= 1, 'Offre de stagiaire bloquée par exclusion');

  // Verify applications in storage
  const apps1 = store['applications'];
  assert.equal(apps1.length, 2, '2 candidatures créées dans le premier cycle');

  for (const app of apps1) {
    assert.equal(app.status, 'Simulé', 'Le statut doit être strictly « Simulé » et jamais « Envoyée »');
    assert.equal(app.is_simulated, true, 'is_simulated: true');
    assert.equal(app.cv_filename, testCvName, 'CV réel utilisé sans valeur en dur');
    assert(app.submission_proof, 'Preuve de simulation présente');
    assert.equal(app.submission_proof.is_simulation, true);
    assert(app.submission_proof.reference.startsWith('SIM-CH-'), 'Référence d’audit au format SIM-CH-...');
    assert(app.submission_proof.disclaimer.includes('simulation interne'), 'Avertissement de non-envoi réel explicite');
  }
  console.log('  ✓ Statut « Simulé » distinct de « Envoyée » validé avec référence d’audit');
  console.log('  ✓ Limite par cycle (max_candidates_per_cycle = 2) respectée');

  // Execute 2nd cycle: 1 remaining eligible job
  const report2 = await runAutonomousCycle(false);
  assert.equal(report2.submitted_simulated_count, 1, 'La 3e offre éligible est traitée au 2e cycle');
  const apps2 = store['applications'];
  assert.equal(apps2.length, 3, 'Total de 3 candidatures simulées');

  // Check quota enforcement on current Zurich calendar day
  const pipeStatus = getPipelineStatus();
  assert.equal(pipeStatus.daily_submissions_count, 3, '3 candidatures comptabilisées pour la date civile de Zurich');
  assert.equal(pipeStatus.daily_submission_quota, 5);
  assert.equal(pipeStatus.mode, 'simulation');

  // ==========================================
  // 6. Test Blocage si CV Absent sur Disque
  // ==========================================
  console.log('6. Tests Blocage si CV Absent sur Disque...');

  // Change profile CV to a non-existing file
  store['user_profile'] = [{
    ...fullMockProfile,
    cv_filename: 'cv_introuvable.pdf'
  }];
  const newJob: Job = {
    id: 305,
    source: 'jobup_ch',
    title: 'Account Executive Switzerland',
    company: 'New SA',
    location: 'Genève',
    canton: 'GE',
    remote: false,
    url: 'https://www.jobup.ch/305',
    description: 'Excellente opportunité détaillée pour un Account Executive à Genève avec plus de soixante caractères.',
    status: 'Nouvelle',
    score: 92
  };
  store['jobs'].push(newJob);
  store['cart'].push({ job_id: 305, title: newJob.title, company: newJob.company });

  const reportCvMissing = await runAutonomousCycle(true);
  assert(reportCvMissing.needs_review_count >= 1, 'L’offre passe en « À vérifier » car le CV est introuvable');
  const missingApp = store['applications'].find((a: any) => a.job_id === 305);
  assert(missingApp, 'Candidature créée au statut « À vérifier »');
  assert.equal(missingApp.status, 'À vérifier');
  assert(missingApp.blocked_reason.includes('introuvable sur le disque'), 'Raison explicite de blocage');
  console.log('  ✓ Candidature orientée vers « À vérifier » dès que le CV est physiquement absent');

  // Clean up temporary test files
  fs.rmSync(testTempDir, { recursive: true, force: true });

  console.log('\n===============================================================');
  console.log('SUCCÈS : TOUS LES TESTS DU PIPELINE ET DES QUOTAS ZURICH SONT VALIDÉS !');
  console.log('===============================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Échec du test :', err);
  process.exit(1);
});
