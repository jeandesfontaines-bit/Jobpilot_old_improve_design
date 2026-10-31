import axios from 'axios';
import fs from 'fs';
import path from 'path';
import http from 'http';
import {
  scrapeJobRoom,
  extractJobRoomAd
} from '../src/services/jobRoomConnector';
import { checkJobExclusions } from '../src/services/exclusionMatcher';

const BASE_URL = process.env.JOBPILOT_TEST_URL || 'http://localhost:3000';

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

async function runTests() {
  console.log('=== TEST SUITE 1 : Pagination réelle & Dépassement du plafond de 6 annonces ===');

  // Test 1: Real multi-page collection from Job-Room for Geneva and Vaud (maxPages: 2 -> 100 items)
  const realRes = await scrapeJobRoom({
    maxPages: 2,
    pageSize: 50,
    cantonCodes: ['GE', 'VD'],
    delayMinMs: 100,
    delayMaxMs: 200
  });

  assert(realRes.detected >= 50, `Détection réelle supérieure au plafond de 6 (détecté : ${realRes.detected} annonces)`);
  assert(realRes.jobs.length >= 50, `Extraction complète de toutes les annonces de la page sans plafond (extraits : ${realRes.jobs.length})`);
  assert(realRes.pagesFetched === 2, `Parcours réel de 2 pages distinctes (pages parcourues : ${realRes.pagesFetched})`);
  assert(realRes.status === 'max_pages_reached', 'Statut contrôlé de fin de lot (max_pages_reached)');
  assert(realRes.totalReported !== null && realRes.totalReported > 1000, `Total d'annonces réelles reporté par l'API Job-Room (> 1000 : ${realRes.totalReported})`);

  // Vérification de l'intégrité des données extraites
  const firstJob = realRes.jobs[0];
  assert(typeof firstJob.title === 'string' && firstJob.title.length > 0, 'Présence du titre');
  assert(typeof firstJob.company === 'string' && firstJob.company.length > 0, 'Présence de l’entreprise');
  assert(firstJob.canton === 'GE' || firstJob.canton === 'VD', `Canton ciblé valide (${firstJob.canton})`);
  assert(typeof firstJob.description === 'string' && firstJob.description.length > 50, 'Présence de la description complète sans requête GET {id} séparée');

  console.log('\n=== TEST SUITE 2 : Fin de pagination, page répétée & erreur partielle (simulations contrôlées) ===');

  // Create a local mock server to test exact edge conditions (end of pagination, repeated page, network failure)
  let mockPageCallCount = 0;
  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url || '', 'http://localhost');
    const page = Number(url.searchParams.get('page') || '0');
    const scenario = url.searchParams.get('scenario') || 'normal';

    if (scenario === 'end_of_pages') {
      // Page 0 returns 10 items with rel="next"
      // Page 1 returns 5 items without rel="next"
      if (page === 0) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=1&size=10>; rel="next", </api/_search?page=1&size=10>; rel="last"',
          'x-total-count': '15'
        });
        const items = Array.from({ length: 10 }, (_, i) => ({
          jobAdvertisement: { id: `item_p0_${i}`, title: `Job P0 ${i}` }
        }));
        res.end(JSON.stringify(items));
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=0&size=10>; rel="prev", </api/_search?page=1&size=10>; rel="last"',
          'x-total-count': '15'
        });
        const items = Array.from({ length: 5 }, (_, i) => ({
          jobAdvertisement: { id: `item_p1_${i}`, title: `Job P1 ${i}` }
        }));
        res.end(JSON.stringify(items));
      }
    } else if (scenario === 'repeated_page') {
      // Returns the exact same IDs on page 1 as page 0 (loop detection)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Link': '</api/_search?page=1&size=10>; rel="next"',
        'x-total-count': '100'
      });
      const items = Array.from({ length: 5 }, (_, i) => ({
        jobAdvertisement: { id: `duplicate_item_${i}`, title: `Dup Job ${i}` }
      }));
      res.end(JSON.stringify(items));
    } else if (scenario === 'error_midway') {
      if (page === 0) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=1&size=10>; rel="next"',
          'x-total-count': '100'
        });
        const items = Array.from({ length: 10 }, (_, i) => ({
          jobAdvertisement: { id: `ok_item_${i}`, title: `OK Job ${i}` }
        }));
        res.end(JSON.stringify(items));
      } else {
        // Page 1 fails with 500 Internal Server Error
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Source network error' }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(9876, () => resolve()));

  try {
    // 2.1 Test : Fin de pagination propre
    const endRes = await scrapeJobRoom({
      pageSize: 10,
      delayMinMs: 10,
      delayMaxMs: 20,
      testUrl: 'http://localhost:9876/_search?scenario=end_of_pages'
    });
    assert(endRes.status === 'completed', 'Détection propre de la fin de pagination (status: completed)');
    assert(endRes.detected === 15, `Toutes les 15 annonces des 2 pages ont été extraites (reçu: ${endRes.detected})`);
    assert(endRes.pagesFetched === 2, `Arrêt automatique après la page finale sans boucle`);

    // 2.2 Test : Détection d'une page répétée
    const loopRes = await scrapeJobRoom({
      pageSize: 5,
      delayMinMs: 10,
      delayMaxMs: 20,
      testUrl: 'http://localhost:9876/_search?scenario=repeated_page'
    });
    assert(loopRes.status === 'page_repeated', 'Détection immédiate d’une page répétée (status: page_repeated)');
    assert(loopRes.jobs.length === 5, 'Arrêt de pagination évitant la duplication en boucle');

    // 2.3 Test : Erreur en cours de collecte (résilience et sauvegarde partielle)
    const errorRes = await scrapeJobRoom({
      pageSize: 10,
      delayMinMs: 10,
      delayMaxMs: 20,
      testUrl: 'http://localhost:9876/_search?scenario=error_midway'
    });
    assert(errorRes.status === 'partial', 'Statut "partial" lors d’une erreur en cours de route');
    assert(errorRes.jobs.length === 10, 'Conservation intégrale des données récupérées sur la page précédente');
    assert(errorRes.error !== null, 'Détail de l’erreur conservé pour traçabilité');
  } finally {
    mockServer.close();
  }

  console.log('\n=== TEST SUITE 3 : Intégration API, Déduplication, Préservation des notes/candidatures & Exclusions ===');

  // Sauvegarde de l'état initial des jobs et du profil
  const initialJobsRes = await axios.get(`${BASE_URL}/api/jobs?view=all`);
  const initialJobs = initialJobsRes.data;

  const initialProfileRes = await axios.get(`${BASE_URL}/api/profile`);
  const initialProfile = initialProfileRes.data;

  // Création d'une candidature et note sur le premier job existant
  const targetJob = initialJobs[0];
  const testJobId = targetJob.id;

  // Créer ou vérifier une candidature
  await axios.patch(`${BASE_URL}/api/jobs/${testJobId}/status`, { status: 'À postuler' });

  // 3.1 Premier lancement de collecte Job-Room (limité à 1 page pour test d'intégration rapide)
  const scrape1Res = await axios.post(`${BASE_URL}/api/sources/job_room/scrape?max_pages=1`);
  assert(scrape1Res.data.success === true, 'Lancement API de collecte Job-Room réussi');
  const newlyAddedInRun1 = scrape1Res.data.new_found;
  console.log(`  ✓ 1er lancement : ${scrape1Res.data.detected} annonces traitées, ${newlyAddedInRun1} nouvelles offres enregistrées`);

  // 3.2 Deuxième lancement immédiat avec les mêmes pages : 0 nouveau doublon
  const scrape2Res = await axios.post(`${BASE_URL}/api/sources/job_room/scrape?max_pages=1`);
  assert(scrape2Res.data.success === true, '2e lancement API de collecte Job-Room réussi');
  assert(
    scrape2Res.data.new_found === 0,
    `Deuxième lancement sans nouveaux doublons : 0 doublon créé (new_found : ${scrape2Res.data.new_found})`
  );

  // 3.3 Vérification de la conservation des notes, candidatures et favoris
  const afterScrapeJobsRes = await axios.get(`${BASE_URL}/api/jobs?view=all`);
  const jobAfterScrape = afterScrapeJobsRes.data.find((j: any) => j.id === testJobId);
  assert(
    jobAfterScrape && jobAfterScrape.status === 'À postuler',
    'Le statut personnalisé / favori de l’annonce est strictement conservé'
  );

  // 3.4 Vérification du maintien du fonctionnement des exclusions sur les offres collectées
  // Excluons un métier (ex: "technicien" ou "analyste")
  const testExclusion = 'technicien';
  await axios.put(`${BASE_URL}/api/profile`, {
    ...initialProfile,
    excluded_roles: [testExclusion]
  });

  const activeJobsAfterExclusion = (await axios.get(`${BASE_URL}/api/jobs?view=active`)).data;
  const excludedJobsAfterExclusion = (await axios.get(`${BASE_URL}/api/jobs?view=excluded`)).data;

  assert(
    !activeJobsAfterExclusion.some((j: any) => checkJobExclusions(j.title, [testExclusion]).isExcluded),
    'Aucune offre exclue n’apparaît dans la vue active des offres Job-Room collectées'
  );
  assert(
    excludedJobsAfterExclusion.every((j: any) => j.is_excluded === true),
    'Toutes les offres de la vue exclue sont correctement annotées'
  );

  // Restauration du profil initial
  await axios.put(`${BASE_URL}/api/profile`, initialProfile);
  console.log('  ✓ Profil initial et exclusions restaurés');

  console.log('\n========================================');
  console.log(`SUCCÈS : ${passedTests}/${totalTests} TESTS PASSÉS AVEC SUCCÈS !`);
  console.log(`========================================`);
}

runTests().catch((e) => {
  console.error('Échec de la suite de tests :', e);
  process.exit(1);
});
