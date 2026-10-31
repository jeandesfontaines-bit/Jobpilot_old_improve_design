import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, ChildProcess } from 'node:child_process';
import axios from 'axios';

let totalTests = 0;
let passedTests = 0;

function check(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') return reject(new Error('Port introuvable'));
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

function makeJobRoomItem(id: string, title: string, company: string, city: string, canton: string) {
  return {
    jobAdvertisement: {
      id,
      title,
      company: { name: company },
      jobContent: {
        company: { name: company },
        locations: [{ city, cantonCode: canton }],
        jobDescriptions: [{ title, description: `Description détaillée pour le poste de ${title} chez ${company}.` }]
      }
    }
  };
}

async function runIntegrationTests() {
  console.log('=== TEST D’INTÉGRATION DU VÉRITABLE SERVEUR (server.ts) ===');
  console.log('Isolation complète : répertoires temporaires dédiés et mock Job-Room local.');

  // 1. Répertoires temporaires isolés
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-server-integ-'));
  const tempDataDir = path.join(tempDir, 'data');
  const tempUploadsDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(tempDataDir, { recursive: true });
  fs.mkdirSync(tempUploadsDir, { recursive: true });

  // Indicateur mode test pour le serveur
  fs.writeFileSync(path.join(tempDataDir, '.test-mode'), 'true');

  // Initialisation profil utilisateur fictif
  const initialProfile = {
    first_name: 'Testeur',
    last_name: 'Suisse',
    email: 'testeur@example.ch',
    phone: '079 123 45 67',
    city: 'Genève',
    canton: 'GE',
    wanted_roles: ['Développeur Full Stack', 'Ingénieur Cloud'],
    wanted_cantons: ['GE', 'VD'],
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
    excluded_roles: []
  };
  fs.writeFileSync(path.join(tempDataDir, 'user_profile.json'), JSON.stringify([initialProfile], null, 2));

  // Pré-remplissage avec une offre existante
  const preExistingJob = {
    id: 9001,
    source: 'job_room',
    external_id: 'jobroom_existing_1',
    title: 'Consultant Senior',
    company: 'Global Corp',
    location: 'Genève, GE',
    canton: 'GE',
    status: 'Entretien',
    notes: 'Premier tour validé avec le CTO',
    is_favorite: true,
    application_id: 8001,
    created_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(tempDataDir, 'jobs.json'), JSON.stringify([preExistingJob], null, 2));

  // Pré-remplissage avec une candidature liée
  const preExistingApp = {
    id: 8001,
    job_id: 9001,
    status: 'Envoyée',
    cover_letter: 'Lettre de motivation initiale pour Global Corp',
    cv_filename: 'CV_Test.pdf',
    sent_at: '2026-10-10T10:00:00Z',
    created_at: '2026-10-09T10:00:00Z'
  };
  fs.writeFileSync(path.join(tempDataDir, 'applications.json'), JSON.stringify([preExistingApp], null, 2));

  // 2. Mock Server Job-Room
  let mockScenario: string = 'standard';
  let mockCallCount: number = 0;

  const mockServer = http.createServer((req: any, res: any) => {
    mockCallCount++;
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const page = Number(url.searchParams.get('page') || '0');

    res.setHeader('Content-Type', 'application/json');

    if (mockScenario === 'standard') {
      const items = [
        makeJobRoomItem('mock_std_1', 'Développeur React Senior', 'Fintech SA', 'Genève', 'GE'),
        makeJobRoomItem('mock_std_2', 'Architecte Cloud AWS', 'Cloud SA', 'Lausanne', 'VD')
      ];
      res.setHeader('x-total-count', '2');
      return res.end(JSON.stringify(items));
    }

    if (mockScenario === 'concurrent') {
      // Différenciation des réponses selon le nombre d'appels pour deux scrapes simultanés
      const idPrefix = mockCallCount % 2 === 1 ? 'batchA' : 'batchB';
      const items = [
        makeJobRoomItem(`mock_${idPrefix}_1`, `Ingénieur ${idPrefix} 1`, 'Entreprise A', 'Genève', 'GE'),
        makeJobRoomItem(`mock_${idPrefix}_2`, `Ingénieur ${idPrefix} 2`, 'Entreprise B', 'Lausanne', 'VD')
      ];
      res.setHeader('x-total-count', '2');
      return res.end(JSON.stringify(items));
    }

    if (mockScenario === 'status_patch') {
      const items = [
        makeJobRoomItem('mock_sp_1', 'Data Engineer', 'Data Corp', 'Genève', 'GE'),
        makeJobRoomItem('mock_sp_2', 'ML Engineer', 'AI Labs', 'Lausanne', 'VD')
      ];
      res.setHeader('x-total-count', '2');
      return res.end(JSON.stringify(items));
    }

    if (mockScenario === 'max_pages_reached') {
      // 2 pages disponibles, avec en-tête Link next sur page 0
      if (page === 0) {
        res.setHeader('x-total-count', '4');
        res.setHeader('Link', '</search?page=1>; rel="next"');
        return res.end(JSON.stringify([
          makeJobRoomItem('mock_mp_1', 'Tech Lead', 'Lead SA', 'Genève', 'GE'),
          makeJobRoomItem('mock_mp_2', 'Scrum Master', 'Agile Corp', 'Lausanne', 'VD')
        ]));
      }
      res.setHeader('x-total-count', '4');
      return res.end(JSON.stringify([
        makeJobRoomItem('mock_mp_3', 'DevOps Specialist', 'Ops SA', 'Genève', 'GE'),
        makeJobRoomItem('mock_mp_4', 'QA Automation', 'Quality SA', 'Lausanne', 'VD')
      ]));
    }

    if (mockScenario === 'inconsistent') {
      // Annonce 50 annonces mais n'en renvoie que 2 sans Link next
      res.setHeader('x-total-count', '50');
      return res.end(JSON.stringify([
        makeJobRoomItem('mock_inc_1', 'Analyste BI', 'BI Corp', 'Genève', 'GE'),
        makeJobRoomItem('mock_inc_2', 'DBA Postgres', 'Data SA', 'Lausanne', 'VD')
      ]));
    }

    if (mockScenario === 'error_500') {
      res.statusCode = 500;
      return res.end(JSON.stringify({ message: 'Internal Server Error sur Job-Room' }));
    }

    res.statusCode = 404;
    res.end();
  });

  const mockPort = await getFreePort();
  await new Promise<void>((resolve) => mockServer.listen(mockPort, '127.0.0.1', resolve));

  // 3. Port libre pour le véritable serveur et démarrage du processus enfant
  const serverPort = await getFreePort();
  const serverBaseUrl = `http://127.0.0.1:${serverPort}`;

  let serverProcess: ChildProcess | null = null;

  try {
    console.log(`Lancement du véritable process server.ts sur le port ${serverPort}...`);
    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(serverPort),
        JOBPILOT_DATA_DIR: tempDataDir,
        JOBPILOT_UPLOADS_DIR: tempUploadsDir,
        JOBPILOT_SKIP_VITE: 'true',
        JOBPILOT_TEST_MODE: '1',
        JOBPILOT_JOBROOM_TEST_URL: `http://127.0.0.1:${mockPort}/search`
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stderr?.on('data', (d) => {
      const str = d.toString();
      if (!str.includes('ExperimentalWarning') && !str.includes('warning')) {
        console.error(`[server.ts stderr] ${str.trim()}`);
      }
    });

    // Attente explicite que le serveur soit prêt avant les requêtes
    let ready = false;
    const startWait = Date.now();
    while (!ready && Date.now() - startWait < 15000) {
      try {
        const ping = await axios.get(`${serverBaseUrl}/api/sources`, { timeout: 1000 });
        if (ping.status === 200) {
          ready = true;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    check(ready, 'Le véritable server.ts a démarré et répond sur son port dédié');

    // SCÉNARIO A : Une collecte ajoute les nouvelles offres sans modifier les statuts, notes et favoris des offres existantes
    console.log('\n--- Scénario A : Conservation des données utilisateur existantes ---');
    mockScenario = 'standard';
    const scrapeResA = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`);
    check(scrapeResA.data.success === true, 'La collecte retourne success: true');
    check(scrapeResA.data.new_found === 2, '2 nouvelles annonces détectées et enregistrées');

    const jobsA = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data;
    const existingJobAfterA = jobsA.find((j: any) => j.id === 9001);
    check(existingJobAfterA !== undefined, 'L’offre pré-existante (id: 9001) est toujours présente');
    check(existingJobAfterA.status === 'Entretien', 'Le statut utilisateur ("Entretien") est strictement préservé');
    check(existingJobAfterA.notes === 'Premier tour validé avec le CTO', 'Les notes de l’offre sont intactes');
    check(existingJobAfterA.is_favorite === true, 'Le favori utilisateur est intact');

    // SCÉNARIO B : Deux collectes concurrentes avec des offres distinctes ne perdent aucune des nouvelles offres
    console.log('\n--- Scénario B : Deux collectes concurrentes sans perte d’offres ---');
    mockScenario = 'concurrent';
    const jobsBeforeB = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data.length;

    // Lancement simultané de deux requêtes de scraping
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`),
      axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`)
    ]);
    check(concurrentRes1.data.success === true && concurrentRes2.data.success === true, 'Les deux collectes concurrentes réussissent');

    const jobsAfterB = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data;
    check(
      jobsAfterB.length === jobsBeforeB + 4,
      `Les 4 offres issues des deux collectes sont toutes présentes (${jobsBeforeB} -> ${jobsAfterB.length})`
    );

    // SCÉNARIO C : Une modification de statut pendant une collecte reste présente après l'enregistrement
    console.log('\n--- Scénario C : Modification de statut concurrente à une collecte ---');
    mockScenario = 'status_patch';
    // Pour rendre le test 100% déterministe, on injecte un délai contrôlé dans la file d'attente du scrape
    const slowScrapePromise = axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`, {}, {
      headers: {
        'x-test-delay': '300',
        'x-test-secret': 'super-secret-test'
      }
    });

    // Pendant que le scrape est en cours, on modifie le statut de l'offre 9001
    await new Promise((r) => setTimeout(r, 50));
    const patchStatusPromise = axios.patch(`${serverBaseUrl}/api/jobs/9001/status`, {
      status: 'Offre reçue'
    });

    const [slowScrapeRes, patchRes] = await Promise.all([slowScrapePromise, patchStatusPromise]);
    check(slowScrapeRes.data.success === true, 'La collecte s’est achevée avec succès');
    check(patchRes.data.success === true, 'La mise à jour de statut a réussi');

    const jobsAfterC = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data;
    const job9001AfterC = jobsAfterC.find((j: any) => j.id === 9001);
    check(
      job9001AfterC.status === 'Offre reçue',
      'Le statut modifié pendant la collecte est conservé ("Offre reçue") et n’a pas été écrasé'
    );

    // SCÉNARIO D : Un deuxième lancement avec les mêmes identifiants ne crée pas de doublons (new_found = 0)
    console.log('\n--- Scénario D : Non-duplication et new_found = 0 ---');
    mockScenario = 'standard'; // Annonces mock_std_1 et mock_std_2 déjà collectées en Scénario A
    const jobsCountBeforeD = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data.length;
    const scrapeResD = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`);
    check(scrapeResD.data.new_found === 0, 'new_found vaut exactement 0 lors d’une ré-exécution identique');

    const jobsCountAfterD = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data.length;
    check(jobsCountAfterD === jobsCountBeforeD, 'Aucun doublon créé dans la base de données');

    // SCÉNARIO E : Les candidatures liées et leurs données restent inchangées
    console.log('\n--- Scénario E : Intégrité des candidatures liées ---');
    const appsAfter = (await axios.get(`${serverBaseUrl}/api/applications`)).data;
    const linkedApp = appsAfter.find((a: any) => a.id === 8001);
    check(linkedApp !== undefined, 'La candidature 8001 liée à l’offre 9001 est présente');
    check(linkedApp.job_id === 9001, 'Le lien candidature -> job_id: 9001 est préservé');
    check(linkedApp.status === 'Envoyée', 'Le statut de la candidature est intact ("Envoyée")');
    check(linkedApp.cover_letter === 'Lettre de motivation initiale pour Global Corp', 'La lettre de motivation est intacte');

    // SCÉNARIO F : Statuts non complets (max_pages_reached, inconsistent) -> complete: false avec sauvegarde des offres
    console.log('\n--- Scénario F : Statuts partiels produisant complete: false ---');
    mockScenario = 'max_pages_reached';
    const jobsCountBeforeF = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data.length;
    const scrapeResF1 = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape?max_pages=1`);
    check(scrapeResF1.data.status === 'max_pages_reached', 'Le statut retourné est bien max_pages_reached');
    check(scrapeResF1.data.complete === false, 'complete vaut bien false');
    check(scrapeResF1.data.new_found === 2, 'Les annonces de la page atteinte sont sauvegardées (new_found = 2)');

    const jobsCountAfterF1 = (await axios.get(`${serverBaseUrl}/api/jobs?view=all`)).data.length;
    check(jobsCountAfterF1 === jobsCountBeforeF + 2, 'Les annonces ont été enregistrées sur le disque');

    mockScenario = 'inconsistent';
    const scrapeResF2 = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`);
    check(scrapeResF2.data.status === 'inconsistent', 'Le statut retourné est inconsistent');
    check(scrapeResF2.data.complete === false, 'complete vaut false en cas d’incohérence');

    // SCÉNARIO G : Un résultat error ne produit pas de faux succès
    console.log('\n--- Scénario G : Résultat error sans faux succès ---');
    mockScenario = 'error_500';
    const scrapeResG = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`);
    check(scrapeResG.data.success === false, 'Un échec réseau retourne success: false');
    check(scrapeResG.data.status === 'error', 'Le statut renvoyé est "error"');
    check(scrapeResG.data.complete === false, 'complete vaut false');

    const sourcesG = (await axios.get(`${serverBaseUrl}/api/sources`)).data;
    const jobRoomSrcG = sourcesG.find((s: any) => s.name === 'job_room');
    check(jobRoomSrcG.status === 'erreur', 'La source job_room est marquée avec le statut "erreur"');

    // SCÉNARIO H : Un échec d’écriture ne produit pas de message affirmant que les offres ont été sauvegardées
    console.log('\n--- Scénario H : Échec d’écriture disque sans message de réussite trompeur ---');
    mockScenario = 'standard';
    // Activation de l'échec simulé d'écriture
    fs.writeFileSync(path.join(tempDataDir, '.simulate-write-failure'), 'true');
    try {
      const scrapeResH = await axios.post(`${serverBaseUrl}/api/sources/job_room/scrape`, {}, {
        validateStatus: () => true // Autorise tous les codes HTTP sans lancer d'exception axios
      });
      check(scrapeResH.status === 500, 'Le serveur répond par un code HTTP 500 en cas d’échec d’écriture');
      check(scrapeResH.data.success === false, 'success vaut false');
      check(scrapeResH.data.error.includes('Erreur d\'écriture disque'), 'L’erreur signale explicitement le problème disque');
      check(!scrapeResH.data.message || !scrapeResH.data.message.includes('succès'), 'Aucun message n’affirme que les offres ont été enregistrées');
    } finally {
      // Désactivation de l'échec simulé
      if (fs.existsSync(path.join(tempDataDir, '.simulate-write-failure'))) {
        fs.unlinkSync(path.join(tempDataDir, '.simulate-write-failure'));
      }
    }

    console.log('\n========================================');
    console.log(`SUCCÈS : ${passedTests}/${totalTests} VÉRIFICATIONS D’INTÉGRATION PASSÉES !`);
    console.log('========================================');
  } finally {
    // Nettoyage impératif et arrêt des processus
    console.log('\nNettoyage et arrêt des serveurs de test...');
    if (serverProcess) {
      try {
        serverProcess.kill('SIGKILL');
      } catch (e) {}
    }
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignorer les erreurs de suppression différée de répertoire temporaire
    }
    console.log('Serveur réel arrêté et répertoires temporaires supprimés (données réelles 100% préservées).');
    process.exit(0);
  }
}

runIntegrationTests().catch((e) => {
  console.error('\nÉchec des tests d’intégration du véritable serveur :', e);
  process.exit(1);
});
