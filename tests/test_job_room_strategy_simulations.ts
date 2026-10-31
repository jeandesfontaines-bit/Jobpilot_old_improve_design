import axios from 'axios';
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

async function runSimulatedStrategyTests() {
  console.log('=== DÉBUT DES TESTS SIMULÉS DE LA STRATÉGIE JOB-ROOM ===');

  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url || '', 'http://localhost');
    const page = Number(url.searchParams.get('page') || '0');
    const scenario = url.searchParams.get('scenario') || 'normal';

    if (scenario === 'multi_page_with_duplicates') {
      if (page === 0) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=1&size=5>; rel="next"',
          'x-total-count': '4'
        });
        res.end(JSON.stringify([
          { jobAdvertisement: { id: 'job_A', title: 'Développeur A' } },
          { jobAdvertisement: { id: 'job_B', title: 'Développeur B' } }
        ]));
      } else if (page === 1) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=2&size=5>; rel="next"',
          'x-total-count': '4'
        });
        res.end(JSON.stringify([
          { jobAdvertisement: { id: 'job_A', title: 'Développeur A (doublon)' } },
          { jobAdvertisement: { id: 'job_C', title: 'Développeur C' } }
        ]));
      } else {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'x-total-count': '4'
        });
        res.end(JSON.stringify([
          { jobAdvertisement: { id: 'job_D', title: 'Développeur D' } }
        ]));
      }
    } else if (scenario === 'no_new_items') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-total-count': '1'
      });
      res.end(JSON.stringify([
        { jobAdvertisement: { id: 'job_A', title: 'Développeur A' } }
      ]));
    } else if (scenario === 'partial_collection') {
      if (page === 0) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Link': '</api/_search?page=1&size=5>; rel="next"',
          'x-total-count': '10'
        });
        res.end(JSON.stringify([
          { jobAdvertisement: { id: 'job_part_1', title: 'Partiel 1' } }
        ]));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gateway timeout' }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(9877, () => resolve()));

  try {
    console.log('\n--- Test 1 : Pagination multiple & déduplication robuste ---');
    const multiRes = await scrapeJobRoom({
      pageSize: 5,
      delayMinMs: 1,
      delayMaxMs: 2,
      testUrl: 'http://localhost:9877/_search?scenario=multi_page_with_duplicates'
    });

    assert(multiRes.status === 'completed', `Statut completed pour pagination multiple (reçu: ${multiRes.status}, err: ${multiRes.error})`);
    assert(multiRes.uniqueDetected === 4, `4 identifiants uniques détectés (A, B, C, D) : ${multiRes.uniqueDetected}`);
    assert(multiRes.jobs.length === 4, 'Exactement 4 jobs dédupliqués extraits');
    assert(multiRes.pagesFetched === 3, `3 pages parcourues malgré les doublons sur la page 1 (${multiRes.pagesFetched})`);

    console.log('\n--- Test 2 : Absence de nouveautés (lot incrémental) ---');
    const noNewRes = await scrapeJobRoom({
      pageSize: 5,
      delayMinMs: 1,
      delayMaxMs: 2,
      testUrl: 'http://localhost:9877/_search?scenario=no_new_items'
    });
    assert(noNewRes.status === 'completed', 'Statut completed même en l’absence de nouveautés');
    assert(noNewRes.uniqueDetected === 1, '1 élément existant retourné');

    console.log('\n--- Test 3 : Collecte partielle (erreur en cours de route) ---');
    const partialRes = await scrapeJobRoom({
      pageSize: 5,
      delayMinMs: 1,
      delayMaxMs: 2,
      testUrl: 'http://localhost:9877/_search?scenario=partial_collection'
    });
    assert(partialRes.status === 'partial', 'Statut partial en cas d’erreur mid-pagination');
    assert(partialRes.jobs.length === 1, 'Conservation des données de la page réussie précédente');
    assert(partialRes.error !== null, 'Message d’erreur enregistré');

    console.log('\n========================================');
    console.log(`SUCCÈS : ${passedTests}/${totalTests} TESTS DE STRATÉGIE PASSÉS !`);
    console.log(`========================================`);
  } finally {
    mockServer.close();
  }
}

runSimulatedStrategyTests().catch((err) => {
  console.error('Erreur lors des tests simulés :', err);
  process.exit(1);
});
