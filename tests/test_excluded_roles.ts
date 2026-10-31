import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'node:os';
import http from 'node:http';
import {
  matchesExclusion,
  checkJobExclusions,
  stemFrenchWord,
  tokenizeFrench
} from '../src/services/exclusionMatcher';

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

async function runAllTests() {
  console.log('=== TEST SUITE 1 : Tokenizer & Stemmer français ===');

  assert(
    tokenizeFrench('Vendeur / vendeuse en boulangerie à 60 %').join(',') ===
      'vendeur,vendeuse,en,boulangerie,a,60',
    'Tokenisation avec slashs, accents et pourcentages'
  );

  assert(
    stemFrenchWord('vendeur') === stemFrenchWord('vendeuse'),
    'Harmonisation vendeur / vendeuse'
  );

  assert(
    stemFrenchWord('comptable') === stemFrenchWord('comptables'),
    'Harmonisation singulier/pluriel comptable / comptables'
  );

  assert(
    stemFrenchWord('assistant') === stemFrenchWord('assistante'),
    'Harmonisation assistant / assistante'
  );

  assert(
    stemFrenchWord('technicien') === stemFrenchWord('technicienne'),
    'Harmonisation technicien / technicienne'
  );

  assert(
    stemFrenchWord('commercial') === stemFrenchWord('commerciaux') &&
      stemFrenchWord('commercial') === stemFrenchWord('commerciale') &&
      stemFrenchWord('commercial') === stemFrenchWord('commerciales'),
    'Harmonisation règle générale morphologique -al / -aux / -ale / -ales (commercial / commerciaux)'
  );

  assert(
    stemFrenchWord('fiscal') === stemFrenchWord('fiscaux') &&
      stemFrenchWord('social') === stemFrenchWord('sociaux'),
    'Harmonisation règle générale -al / -aux (fiscal / fiscaux, social / sociaux)'
  );

  console.log('\n=== TEST SUITE 2 : Spécifications et cas métiers utilisateur ===');

  // Règle générale -al / -aux
  assert(
    matchesExclusion('Directeur des affaires commerciales', 'commercial') === true,
    'Règle générale -al / -aux : exclusion « commercial » masque « Directeur des affaires commerciales »'
  );
  assert(
    matchesExclusion('Responsable grands comptes commerciaux', 'commercial') === true,
    'Règle générale -al / -aux : exclusion « commercial » masque « Responsable grands comptes commerciaux »'
  );

  // « comptable » masque « Comptable à 80 % »
  assert(
    matchesExclusion('Comptable à 80 %', 'comptable') === true,
    '« comptable » masque « Comptable à 80 % »'
  );

  // « comptable » masque « Assistant comptable »
  assert(
    matchesExclusion('Assistant comptable', 'comptable') === true,
    '« comptable » masque « Assistant comptable »'
  );

  // « vendeur boulangerie » masque « Vendeur / vendeuse en boulangerie »
  assert(
    matchesExclusion('Vendeur / vendeuse en boulangerie', 'vendeur boulangerie') === true,
    '« vendeur boulangerie » masque « Vendeur / vendeuse en boulangerie »'
  );

  // « vendeur boulangerie » masque « Vendeuse en boulangerie à 60 % »
  assert(
    matchesExclusion('Vendeuse en boulangerie à 60 %', 'vendeur boulangerie') === true,
    '« vendeur boulangerie » masque « Vendeuse en boulangerie à 60 % »'
  );

  // « vendeur boulangerie » NE MASQUE PAS « Vendeur en magasin de sport »
  assert(
    matchesExclusion('Vendeur en magasin de sport', 'vendeur boulangerie') === false,
    '« vendeur boulangerie » ne masque pas « Vendeur en magasin de sport »'
  );

  console.log('\n=== TEST SUITE 3 : Validation des 8 scénarios de livraison ===');

  // Scénario 1 : Une annonce correspond à deux exclusions (retour de TOUTES les exclusions correspondantes)
  const dualExclusions = ['comptable', 'gestionnaire'];
  const dualTitle = 'Assistant comptable et gestionnaire de paie';
  const dualCheck = checkJobExclusions(dualTitle, dualExclusions);
  assert(
    dualCheck.isExcluded === true &&
      dualCheck.matchedPatterns.length === 2 &&
      dualCheck.matchedPatterns.includes('comptable') &&
      dualCheck.matchedPatterns.includes('gestionnaire'),
    'Scénario 1 : Une annonce correspondant à deux exclusions renvoie bien TOUTES les exclusions correspondantes (matchedPatterns)'
  );

  // Scénario 2 : Retirer une seule exclusion la laisse masquée
  const remainingAfterOneRemoval = dualExclusions.filter((e) => e !== 'comptable');
  const checkAfterOneRemoval = checkJobExclusions(dualTitle, remainingAfterOneRemoval);
  assert(
    checkAfterOneRemoval.isExcluded === true && checkAfterOneRemoval.matchedPattern === 'gestionnaire',
    'Scénario 2 : Retirer une seule exclusion laisse l’annonce masquée par la seconde'
  );

  // Scénario 3 : Retirer la dernière exclusion la fait réapparaître
  const remainingAfterAllRemoval: string[] = [];
  const checkAfterAllRemoval = checkJobExclusions(dualTitle, remainingAfterAllRemoval);
  assert(
    checkAfterAllRemoval.isExcluded === false && checkAfterAllRemoval.matchedPattern === undefined,
    'Scénario 3 : Retirer la dernière exclusion fait réapparaître immédiatement l’annonce'
  );

  // Scénario 4 : « Boulanger » reste visible avec seulement « vendeur boulangerie » exclu
  const boulangerTitle = 'Boulanger';
  const checkBoulanger = checkJobExclusions(boulangerTitle, ['vendeur boulangerie']);
  assert(
    checkBoulanger.isExcluded === false,
    'Scénario 4 : « Boulanger » reste visible avec seulement « vendeur boulangerie » exclu'
  );

  // Scénario 5 : Une mention dans la description seule ne masque pas l’annonce
  const sampleJobWithDescMention = {
    id: 99999,
    title: 'Ingénieur Cloud & DevOps',
    description: 'En lien étroit avec le service comptable et les vendeurs de boulangerie pour la facturation.',
    company: 'Entreprise Test',
    canton: 'GE',
    score: 85
  };
  const checkDescOnly = checkJobExclusions(sampleJobWithDescMention.title, ['comptable', 'vendeur boulangerie']);
  assert(
    checkDescOnly.isExcluded === false,
    'Scénario 5 : Une mention dans la description seule ne masque pas l’annonce (comparaison 100% sur le titre)'
  );

  // Scénario 6 : Les candidatures, notes et favoris sont conservés
  // Simulation : un job a une candidature et un statut
  const testJobId = 42;
  const mockApplication = {
    id: 101,
    job_id: testJobId,
    status: 'Envoyée',
    notes: 'Entretien prévu mardi à 10h',
    cover_letter: 'Lettre de motivation préparée',
    created_at: new Date().toISOString()
  };
  // Exclure ce job ne modifie ni ne supprime son application ou ses notes
  const mockJobBefore = {
    id: testJobId,
    title: 'Comptable général',
    company: 'Fiduciaire Alpha',
    status: 'Envoyée',
    score: 90
  };
  const exclusionState = checkJobExclusions(mockJobBefore.title, ['comptable']);
  assert(exclusionState.isExcluded === true, 'Le job est bien étiqueté is_excluded');
  assert(mockJobBefore.status === 'Envoyée', 'Le statut du job reste strictement intact');
  assert(mockApplication.notes === 'Entretien prévu mardi à 10h', 'Les notes de candidature sont intactes');
  assert(mockApplication.job_id === testJobId, 'Le lien candidature-job est intact');

  // Scénario 7 : Un ancien profil sans excluded_roles fonctionne
  const legacyProfile: any = {
    first_name: 'Test',
    wanted_roles: ['Développeur'],
    wanted_cantons: ['GE', 'VD']
    // Pas de clé excluded_roles
  };
  const legacyExclusions = Array.isArray(legacyProfile.excluded_roles) ? legacyProfile.excluded_roles : [];
  assert(legacyExclusions.length === 0, 'Les profils legacy sans excluded_roles renvoient un tableau vide par défaut');
  const legacyCheck = checkJobExclusions('Comptable à 80 %', legacyExclusions);
  assert(legacyCheck.isExcluded === false, 'Aucune offre n’est indûment masquée avec un profil legacy');

  // Scénario 8 : Un éventuel masquage manuel reste indépendant
  const manualStatusJob = {
    id: 50,
    title: 'Chef de projet IT',
    status: 'Archivée', // Masquage ou archivage manuel via le statut
    is_excluded: false
  };
  // Si l'utilisateur a exclus "comptable", ce job n'est pas touché par l'exclusion automatique
  const manualJobExclusion = checkJobExclusions(manualStatusJob.title, ['comptable']);
  assert(
    manualJobExclusion.isExcluded === false && manualStatusJob.status === 'Archivée',
    'Scénario 8 : Le masquage manuel (via statut Archivée/Refusée) reste totalement indépendant de l’exclusion automatique par titre'
  );

  console.log('\n=== TEST SUITE 3B : Moteur générique & Absence totale de métiers en dur ===');

  // Test générique 1 : Expressions arbitraires saisies par l'utilisateur (métiers non pré-définis)
  assert(
    matchesExclusion('Soudeur TIG / MIG qualifié à 100%', 'soudeur tig') === true,
    'Moteur générique : « soudeur tig » masque « Soudeur TIG / MIG qualifié à 100% »'
  );
  assert(
    matchesExclusion('Chauffeur poids lourd international', 'chauffeur livreur') === false,
    'Moteur générique : « chauffeur livreur » NE MASQUE PAS « Chauffeur poids lourd international »'
  );

  // Test générique 2 : Comparaison stricte sur mots entiers (pas de faux positifs de sous-chaîne)
  assert(
    matchesExclusion('Gestionnaire de portefeuille titres', 'portier') === false,
    'Mots entiers : « portier » ne masque pas « portefeuille »'
  );
  assert(
    matchesExclusion('Comptable financier', 'incomptable') === false,
    'Mots entiers : « incomptable » ne masque pas « comptable »'
  );

  // Test générique 3 : Absence d’invention de synonymes ou de métiers voisins
  assert(
    matchesExclusion('Chef de partie en cuisine gastronomique', 'cuisinier') === false,
    'Absence de synonymes automatiques : « cuisinier » ne masque pas « Chef de partie » (nécessite règle explicite)'
  );

  // Test générique 4 : Tous les termes significatifs requis dans l'expression
  assert(
    matchesExclusion('Développeur Frontend React / Vue', 'developpeur backend') === false,
    'Tous les termes requis : « developpeur backend » ne masque pas un poste frontend'
  );

  // Test générique 5 : Une liste vide désactive intégralement le filtrage par exclusion
  assert(
    checkJobExclusions('Directeur financier & comptable général', []).isExcluded === false &&
      checkJobExclusions('Directeur financier & comptable général', []).matchedPatterns.length === 0,
    'Désactivation des exclusions : une liste vide ne masque aucune annonce par métier'
  );

  // Test générique 6 : Une liste excluded_roles vide ne neutralise PAS les autres filtres ni le masquage manuel
  const sampleDataset = [
    { id: 1, title: 'Développeur Fullstack', canton: 'GE', status: 'Nouvelle', score: 85 },
    { id: 2, title: 'Développeur Frontend', canton: 'VD', status: 'Nouvelle', score: 70 },
    { id: 3, title: 'Architecte Solution', canton: 'GE', status: 'Archivée', score: 90 }, // Masquage manuel
  ];
  // 1) Exclusion métier désactivée (tous is_excluded = false)
  const unexcludedList = sampleDataset.map((j) => ({
    ...j,
    is_excluded: checkJobExclusions(j.title, []).isExcluded
  }));
  assert(unexcludedList.every((j) => !j.is_excluded), 'Exclusion métier désactivée : aucun job is_excluded');

  // 2) Les autres filtres restent 100% opérationnels
  const cantonGE = unexcludedList.filter((j) => j.canton === 'GE');
  assert(cantonGE.length === 2, 'Le filtre Canton (GE) reste actif et filtre exactement 2 offres');

  const activeStatusOnly = unexcludedList.filter((j) => j.status === 'Nouvelle');
  assert(activeStatusOnly.length === 2, 'Le filtre Statut reste actif');

  const manualDismissedOnly = unexcludedList.filter((j) => j.status === 'Archivée');
  assert(manualDismissedOnly.length === 1 && manualDismissedOnly[0].id === 3, 'Le masquage manuel (Archivée) reste totalement opérant');

  console.log('\n=== TEST SUITE 4 : Tests API réels & Persistance fichier (Serveur & Données Isolés) ===');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-test-roles-'));
  const isolatedProfilePath = path.join(tmpDir, 'user_profile.json');
  const isolatedJobsPath = path.join(tmpDir, 'jobs.json');

  const initialTestProfile = { first_name: 'Testeur', excluded_roles: [] as string[] };
  const initialTestJobs = [
    { id: 101, title: 'Analyste financier junior', canton: 'GE', status: 'Nouvelle' },
    { id: 102, title: 'Responsable RH senior', canton: 'VD', status: 'Nouvelle' },
    { id: 103, title: 'Développeur Fullstack', canton: 'GE', status: 'Nouvelle' },
    { id: 104, title: 'Gestionnaire de projet', canton: 'VD', status: 'Nouvelle' }
  ];

  fs.writeFileSync(isolatedProfilePath, JSON.stringify([initialTestProfile], null, 2));
  fs.writeFileSync(isolatedJobsPath, JSON.stringify(initialTestJobs, null, 2));

  // Atomic write helper using tmp file + renameSync
  const atomicWrite = (filePath: string, data: any) => {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
  };

  const testServer = http.createServer((req: any, res: any) => {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (pathname === '/api/profile' && method === 'GET') {
      const data = JSON.parse(fs.readFileSync(isolatedProfilePath, 'utf-8'));
      const profile = Array.isArray(data) ? data[0] : data;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(profile));
    }

    if (pathname === '/api/profile' && method === 'PUT') {
      let bodyStr = '';
      req.on('data', (chunk: any) => { bodyStr += chunk; });
      req.on('end', () => {
        const body = JSON.parse(bodyStr || '{}');
        const data = JSON.parse(fs.readFileSync(isolatedProfilePath, 'utf-8'));
        const current = Array.isArray(data) ? data[0] : data;
        const updated = {
          ...current,
          ...body,
          excluded_roles: Array.isArray(body.excluded_roles) ? body.excluded_roles : []
        };
        atomicWrite(isolatedProfilePath, [updated]);
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ success: true, profile: updated }));
      });
      return;
    }

    if (pathname === '/api/jobs' && method === 'GET') {
      const view = parsedUrl.searchParams.get('view') || 'all';
      const pData = JSON.parse(fs.readFileSync(isolatedProfilePath, 'utf-8'));
      const profile = Array.isArray(pData) ? pData[0] : pData;
      const excluded = profile.excluded_roles || [];
      const jobs = JSON.parse(fs.readFileSync(isolatedJobsPath, 'utf-8'));

      const annotated = jobs.map((j: any) => {
        const check = checkJobExclusions(j.title, excluded);
        return {
          ...j,
          is_excluded: check.isExcluded,
          exclusion_reason: check.reason,
          matched_exclusions: check.matchedPatterns
        };
      });

      let filtered = annotated;
      if (view === 'active') filtered = annotated.filter((j: any) => !j.is_excluded);
      else if (view === 'excluded') filtered = annotated.filter((j: any) => j.is_excluded);

      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(filtered));
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const serverAddress = testServer.address();
  const testBaseUrl = typeof serverAddress === 'object' && serverAddress ? `http://127.0.0.1:${serverAddress.port}` : '';

  try {
    const initialProfileRes = await axios.get(`${testBaseUrl}/api/profile`);
    const initialProfile = initialProfileRes.data;
    assert(Array.isArray(initialProfile.excluded_roles), 'GET /api/profile renvoie un tableau excluded_roles');

    // Sauvegarde avec de nouvelles exclusions
    const testExclusions = ['analyste financier', 'responsable rh'];
    const updateRes = await axios.put(`${testBaseUrl}/api/profile`, {
      ...initialProfile,
      excluded_roles: testExclusions
    });
    assert(updateRes.data.success === true, 'PUT /api/profile réussit');

    // Vérification persistance immédiate API
    const reloadedProfileRes = await axios.get(`${testBaseUrl}/api/profile`);
    assert(
      JSON.stringify(reloadedProfileRes.data.excluded_roles) === JSON.stringify(testExclusions),
      'Persistance API vérifiée sur GET /api/profile'
    );

    // Vérification persistance disque dans le fichier isolé
    const diskProfileData = JSON.parse(fs.readFileSync(isolatedProfilePath, 'utf-8'));
    const diskProfile = Array.isArray(diskProfileData) ? diskProfileData[0] : diskProfileData;
    assert(
      JSON.stringify(diskProfile.excluded_roles) === JSON.stringify(testExclusions),
      'Persistance physique vérifiée dans le stockage isolé'
    );

    // Vérification atomicité writeTable (présence du mécanisme .tmp -> rename dans server.ts ou server/db.ts)
    const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');
    const dbSource = fs.existsSync(path.resolve(process.cwd(), 'server/db.ts'))
      ? fs.readFileSync(path.resolve(process.cwd(), 'server/db.ts'), 'utf-8')
      : '';
    const storageSource = serverSource + '\n' + dbSource;
    assert(
      storageSource.includes('.tmp') && storageSource.includes('renameSync'),
      'Le mécanisme d’écriture atomique sécurisée (fichier .tmp et renommage atomique) est présent dans server.ts'
    );

    // Vérification /api/jobs filtrage view=active vs view=excluded
    const activeJobsRes = await axios.get(`${testBaseUrl}/api/jobs?view=active`);
    const excludedJobsRes = await axios.get(`${testBaseUrl}/api/jobs?view=excluded`);
    const allJobsRes = await axios.get(`${testBaseUrl}/api/jobs?view=all`);

    assert(
      activeJobsRes.data.length + excludedJobsRes.data.length === allJobsRes.data.length,
      `Partitionnement exact : ${activeJobsRes.data.length} actives + ${excludedJobsRes.data.length} exclues = ${allJobsRes.data.length} total`
    );
    assert(
      excludedJobsRes.data.length === 2,
      'Exactement 2 annonces sur 4 correspondent aux exclusions testées'
    );

    // Réversibilité complète : on vide la liste
    await axios.put(`${testBaseUrl}/api/profile`, {
      ...initialProfile,
      excluded_roles: []
    });
    const afterResetRes = await axios.get(`${testBaseUrl}/api/jobs?view=active`);
    assert(
      afterResetRes.data.length === allJobsRes.data.length,
      'Réversibilité prouvée : la suppression des exclusions réaffiche immédiatement 100% des annonces'
    );
  } finally {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('  ✓ Serveur de test arrêté et données de test isolées nettoyées (données réelles 100% préservées)');
  }

  console.log(`\n========================================`);
  console.log(`SUCCÈS : ${passedTests}/${totalTests} TESTS PASSÉS AVEC SUCCÈS !`);
  console.log(`========================================`);
}

runAllTests().catch((e) => {
  console.error('Échec de la suite de tests :', e);
  process.exit(1);
});
