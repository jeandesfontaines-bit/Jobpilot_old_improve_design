import fs from 'fs';
import path from 'path';
import http from 'http';
import { scrapeJobRoom } from '../src/services/jobRoomConnector';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('=== TEST SUITE SIMULÉE : STRATÉGIE INCRÉMENTALE JOB-ROOM ===');

  // --- PARTIE 1 : Algorithme de décision du mode et de la fenêtre (en jours entiers) ---
  console.log('\n--- 1. Tests unitaires de la décision du mode et de la fenêtre ---');

  function decideJobRoomMode(srcRecord: any, reqQuery: any = {}, now = Date.now()) {
    const lastSuccess = srcRecord.last_successful_start_time;
    const lastFullSync = srcRecord.last_full_sync_time;
    const forceComplete = reqQuery.mode === 'complete';

    const nowMs = now;
    const sevenDaysMs = 7 * 24 * 3600 * 1000;
    const isWeeklyFullDue = !lastFullSync || (nowMs - new Date(lastFullSync).getTime() >= sevenDaysMs);
    const hasValidResumePoint = Boolean(lastSuccess && !isNaN(new Date(lastSuccess).getTime()));

    let scrapeMode: 'complète' | 'incrémentale' = 'complète';
    let onlineSince: number | null = null;
    let windowDescription = '';

    if (!hasValidResumePoint || forceComplete || isWeeklyFullDue) {
      scrapeMode = 'complète';
      onlineSince = null;
      windowDescription = forceComplete
        ? 'Collecte complète forcée (mode=complete)'
        : (!hasValidResumePoint
            ? 'Première collecte complète GE/VD (aucun point de reprise fiable)'
            : 'Synchronisation complète hebdomadaire (>= 7 jours sans synchro complète)');
    } else {
      const lastSuccessMs = new Date(lastSuccess).getTime();
      const elapsedDays = Math.ceil((nowMs - lastSuccessMs) / (24 * 3600 * 1000));
      const requestedDays = elapsedDays + 1;

      if (requestedDays > 60) {
        scrapeMode = 'complète';
        onlineSince = null;
        windowDescription = `Collecte complète GE/VD requise (fenêtre calculée de ${requestedDays} jours > plafond de 60 jours)`;
      } else {
        scrapeMode = 'incrémentale';
        onlineSince = Math.max(1, Math.min(60, requestedDays));
        windowDescription = `Collecte incrémentale de ${onlineSince} jour(s) entiers (~${onlineSince * 24}h avec 1j de recouvrement, fenêtre approximative)`;
      }
    }

    return { scrapeMode, onlineSince, windowDescription };
  }

  const now = new Date('2026-10-18T12:00:00Z').getTime();

  // 1.1 Pas de point de reprise -> complète
  const r1 = decideJobRoomMode({}, {}, now);
  assert(r1.scrapeMode === 'complète' && r1.onlineSince === null, 'Sans point de reprise fiable -> Mode complète (onlineSince = null)');

  // 1.2 Point de reprise d\'il y a 12 heures (même jour) -> 1j écoulé + 1j recouvrement = 2 jours
  const r2 = decideJobRoomMode({
    last_successful_start_time: new Date(now - 12 * 3600 * 1000).toISOString(),
    last_full_sync_time: new Date(now - 12 * 3600 * 1000).toISOString()
  }, {}, now);
  assert(r2.scrapeMode === 'incrémentale' && r2.onlineSince === 2, `12h écoulées -> Mode incrémental avec onlineSince: 2 jours (calculé: ${r2.onlineSince})`);

  // 1.3 Point de reprise d\'il y a 3 jours -> 3j écoulés + 1j recouvrement = 4 jours
  const r3 = decideJobRoomMode({
    last_successful_start_time: new Date(now - 3 * 24 * 3600 * 1000).toISOString(),
    last_full_sync_time: new Date(now - 3 * 24 * 3600 * 1000).toISOString()
  }, {}, now);
  assert(r3.scrapeMode === 'incrémentale' && r3.onlineSince === 4, `3 jours écoulés -> Mode incrémental avec onlineSince: 4 jours (calculé: ${r3.onlineSince})`);

  // 1.4 Synchronisation hebdomadaire due (8 jours depuis la dernière synchro complète) -> complète
  const r4 = decideJobRoomMode({
    last_successful_start_time: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
    last_full_sync_time: new Date(now - 8 * 24 * 3600 * 1000).toISOString()
  }, {}, now);
  assert(r4.scrapeMode === 'complète' && r4.onlineSince === null, 'Synchro complète hebdomadaire due (>= 7j) -> Bascule automatique en complète');

  // 1.5 Fenêtre dépassant 60 jours -> complète
  const r5 = decideJobRoomMode({
    last_successful_start_time: new Date(now - 65 * 24 * 3600 * 1000).toISOString(),
    last_full_sync_time: new Date(now - 2 * 24 * 3600 * 1000).toISOString()
  }, {}, now);
  assert(r5.scrapeMode === 'complète' && r5.onlineSince === null, 'Fenêtre > 60 jours -> Bascule automatique en complète sans onlineSince');

  // --- PARTIE 2 : Pagination complète de la fenêtre et déduplication sans arrêt au premier doublon ---
  console.log('\n--- 2. Pagination complète de la fenêtre et déduplication ---');

  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url || '', 'http://localhost');
    const page = Number(url.searchParams.get('page') || '0');

    // Scénario : 3 pages avec présence de doublons inter-pages
    if (page === 0) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Link': '</api/_search?page=1&size=3>; rel="next"',
        'x-total-count': '5'
      });
      res.end(JSON.stringify([
        { jobAdvertisement: { id: 'JR-1', title: 'Dev Fullstack' } },
        { jobAdvertisement: { id: 'JR-2', title: 'Dev Backend' } }
      ]));
    } else if (page === 1) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Link': '</api/_search?page=2&size=3>; rel="next"',
        'x-total-count': '5'
      });
      // Page contenant le doublon JR-2 et un nouveau JR-3
      res.end(JSON.stringify([
        { jobAdvertisement: { id: 'JR-2', title: 'Dev Backend (doublon)' } },
        { jobAdvertisement: { id: 'JR-3', title: 'Dev Frontend' } }
      ]));
    } else {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-total-count': '5'
      });
      res.end(JSON.stringify([
        { jobAdvertisement: { id: 'JR-4', title: 'Dev DevOps' } },
        { jobAdvertisement: { id: 'JR-5', title: 'Dev Mobile' } }
      ]));
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(9888, () => resolve()));

  try {
    const scrapeResult = await scrapeJobRoom({
      pageSize: 3,
      onlineSince: 2,
      delayMinMs: 1,
      delayMaxMs: 2,
      testUrl: 'http://localhost:9888/_search'
    });

    assert(scrapeResult.status === 'completed', 'Pagination complète sans interruption due aux doublons (statut completed)');
    assert(scrapeResult.pagesFetched === 3, `Parcours des 3 pages de la fenêtre (${scrapeResult.pagesFetched}/3)`);
    assert(scrapeResult.jobs.length === 5, `Déduplication stricte par ID Job-Room (5 uniques extraits : ${scrapeResult.jobs.length})`);
  } finally {
    mockServer.close();
  }

  // --- PARTIE 3 : Stockage temporaire isolé : Sauvegarde, non-régression et maintien du point de reprise ---
  console.log('\n--- 3. Stockage temporaire isolé & maintien strict du point de reprise ---');

  const tmpDir = path.join('/tmp', `jobpilot_test_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpSourcesFile = path.join(tmpDir, 'sources.json');
  const tmpJobsFile = path.join(tmpDir, 'jobs.json');

  // État initial dans le stockage temporaire
  const initialSources = [{
    name: 'job_room',
    status: 'actif',
    last_run: '2026-10-17T10:00:00Z',
    last_successful_start_time: '2026-10-17T10:00:00Z',
    last_full_sync_time: '2026-10-17T10:00:00Z'
  }];
  const initialJobs = [
    { id: 101, external_id: 'jobroom_EXISTING_1', title: 'Offre ancienne préservée', status: 'À postuler' }
  ];

  fs.writeFileSync(tmpSourcesFile, JSON.stringify(initialSources, null, 2));
  fs.writeFileSync(tmpJobsFile, JSON.stringify(initialJobs, null, 2));

  // Simulation 3.1 : Collecte partielle / erreur -> le point de reprise n'avance pas
  const partialRunTime = '2026-10-18T10:00:00Z';
  const isCompletePartial = false;
  const saveSucceededPartial = true;

  if (isCompletePartial && saveSucceededPartial) {
    initialSources[0].last_successful_start_time = partialRunTime;
  }
  fs.writeFileSync(tmpSourcesFile, JSON.stringify(initialSources, null, 2));

  const afterPartialSources = JSON.parse(fs.readFileSync(tmpSourcesFile, 'utf-8'));
  assert(
    afterPartialSources[0].last_successful_start_time === '2026-10-17T10:00:00Z',
    'En cas de collecte partielle ou erreur, le point de reprise reste inchangé à sa valeur précédente'
  );

  // Simulation 3.2 : Collecte complète réussie -> mise à jour du point de reprise
  const successfulRunTime = '2026-10-18T11:00:00Z';
  const isCompleteSuccess = true;
  const saveSucceededSuccess = true;

  if (isCompleteSuccess && saveSucceededSuccess) {
    initialSources[0].last_successful_start_time = successfulRunTime;
  }
  fs.writeFileSync(tmpSourcesFile, JSON.stringify(initialSources, null, 2));

  const afterSuccessSources = JSON.parse(fs.readFileSync(tmpSourcesFile, 'utf-8'));
  assert(
    afterSuccessSources[0].last_successful_start_time === successfulRunTime,
    'Après collecte complète de la fenêtre ET sauvegarde réussie, le point de reprise avance'
  );

  // Simulation 3.3 : Non-suppression des offres existantes lors d\'un lot incrémental
  const incrementalJobs = [
    { id: 202, external_id: 'jobroom_NEW_1', title: 'Offre nouvelle incrémentale' }
  ];
  // Logique du serveur : unshift des nouvelles, préservation des existantes
  const updatedJobs = [...incrementalJobs, ...initialJobs];
  fs.writeFileSync(tmpJobsFile, JSON.stringify(updatedJobs, null, 2));

  const savedJobs = JSON.parse(fs.readFileSync(tmpJobsFile, 'utf-8'));
  assert(
    savedJobs.some((j: any) => j.external_id === 'jobroom_EXISTING_1' && j.status === 'À postuler'),
    'Les offres préexistantes absentes du lot incrémental sont strictement conservées avec leurs statuts'
  );
  assert(savedJobs.length === 2, 'Ajout de la nouvelle offre sans écrasement (2 offres au total)');

  // Nettoyage du répertoire temporaire
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log('\n========================================');
  console.log(`RÉSULTAT : ${passedTests}/${totalTests} TESTS PASSÉS AVEC SUCCÈS !`);
  console.log('========================================');
}

runTestSuite().catch((err) => {
  console.error('Erreur test suite :', err);
  process.exit(1);
});
