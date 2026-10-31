import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jobpilot-cart-ollama-test-'));
process.env.JOBPILOT_DATA_DIR = path.join(tempRoot, 'data');
process.env.JOBPILOT_UPLOADS_DIR = path.join(tempRoot, 'uploads');
process.env.JOBPILOT_SCREENSHOTS_DIR = path.join(tempRoot, 'screenshots');

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ ÉCHEC : ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function main() {
  console.log('=== TEST CAMPAGNE PANIER SÉQUENTIELLE + OLLAMA CLOUD (CV ATS & LETTRE PDF) ===\n');

  const { writeTable, readTable, UPLOADS_DIR } = await import('../server/db.ts');
  const { ollamaCloud } = await import('../src/services/ollamaCloudClient.ts');
  const { addToCart, processCart, clearCart } = await import('../server/services/cartEngine.ts');
  const { ensureAndGetBaseAtsCv } = await import('../src/services/automationAgent.ts');
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const pdfParse = require('pdf-parse/lib/pdf-parse.js');

  let submittedRequests: string[] = [];
  let visitedUrls: string[] = [];

  // Serveur HTTP local simulant les formulaires de candidature avec CV + Lettre (type="10") + Récapitulatif
  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    visitedUrls.push(`${req.method} ${url}`);

    if (req.method === 'POST' && url.startsWith('/submit')) {
      submittedRequests.push(url);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>Votre candidature a bien été transmise</h1></body></html>');
      return;
    }

    if (url.startsWith('/form-incomplete')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body>
          <h1>Formulaire avec récapitulatif incomplet</h1>
          <form action="/submit" method="POST" enctype="multipart/form-data">
            <input type="text" name="firstname" />
            <input type="text" name="lastname" />
            <input type="email" name="email" />
            <input type="tel" name="phone" />
            <input type="file" name="curriculumsVitae" />
            <select name="Type">
              <option value="1">Autre</option>
              <option value="10">Lettre de motivation</option>
            </select>
            <input type="file" name="coverLetter" />
            <input type="checkbox" name="privacy" />
            <div class="summary-incomplete" data-summary-complete="false">Votre candidature n'est pas complète</div>
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `);
      return;
    }

    // Formulaire complet avec CV + sélecteur type="10" + Lettre de motivation + Récapitulatif au vert
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body>
        <h1>Postuler au poste</h1>
        <form action="/submit" method="POST" enctype="multipart/form-data">
          <input type="text" name="firstname" placeholder="Prénom" />
          <input type="text" name="lastname" placeholder="Nom" />
          <input type="email" name="email" placeholder="E-mail" />
          <input type="tel" name="phone" placeholder="Téléphone" />
          <input type="file" name="curriculumsVitae" accept=".pdf" />
          <select id="Type" name="Type">
            <option value="">Choisir le type</option>
            <option value="9">Certificat de travail</option>
            <option value="10">Lettre de motivation</option>
          </select>
          <input type="file" name="motivationLetter" accept=".pdf" />
          <input type="checkbox" name="privacy" />
          <div class="summary-checklist" data-summary-complete="true">Récapitulatif : tous les voyants sont au vert</div>
          <button type="submit">Envoyer la candidature</button>
        </form>
      </body></html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  // Mock de ollamaCloud.generate
  const ollamaPrompts: string[] = [];
  const originalGenerate = ollamaCloud.generate.bind(ollamaCloud);
  (ollamaCloud as any).generate = async (prompt: string) => {
    ollamaPrompts.push(prompt);
    if (prompt.includes('SIMULATE_OLLAMA_ERROR')) {
      throw new Error('Échec simulé Ollama Cloud sur cette offre');
    }
    if (prompt.includes('prioritized_skills')) {
      // Tente d'injecter une compétence inventée ("Compétence Inventée XYZ") pour vérifier qu'elle est filtrée
      return {
        text: JSON.stringify({
          prioritized_skills: ['ServiceNow', 'Support IT N2', 'Compétence Inventée XYZ'],
          adaptation_summary: 'Mise en avant du support IT N2 et de ServiceNow selon les besoins du poste.'
        }),
        model: 'mock-ollama-cloud'
      };
    }
    return {
      text: `Madame, Monsieur,\n\nFort de mon expérience en tant que Technicien Support IT chez Clinique Générale à Lausanne, je vous soumets ma candidature.\n\nMa maîtrise de ServiceNow, Windows 11 et du Support IT N2 répond directement à vos attentes.\n\nJe reste à votre disposition pour un entretien.\n\nVeuillez agréer, Madame, Monsieur, mes salutations distinguées.`,
      model: 'mock-ollama-cloud'
    };
  };

  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    // Configuration du profil candidat de test
    await writeTable('user_profile', [{
      first_name: 'Jean',
      last_name: 'Desfontaines',
      current_title: 'Technicien Support IT',
      email: 'jean.test@example.ch',
      phone: '+41 79 123 45 67',
      city: 'Lausanne',
      canton: 'VD',
      privacy_consent: true,
      enable_relevance_matching: false,
      skills: ['Support IT N2', 'ServiceNow', 'Windows 11', 'Active Directory'],
      languages: 'Français (C2), Anglais (B2)',
      experiences: [
        {
          title: 'Technicien Support IT',
          company: 'Clinique Générale',
          location: 'Lausanne',
          start_date: '01/2022',
          end_date: 'Présent',
          dates: '01/2022 - Présent',
          realizations: [
            'Support utilisateurs niveau 1 et 2 sur Windows 11 et Microsoft 365',
            'Gestion des tickets d’incidents et demandes dans ServiceNow'
          ]
        }
      ],
      formations: [
        {
          diploma: 'CFC Informaticien',
          institution: 'EPSIC Lausanne',
          location: 'Lausanne',
          start_date: '2018',
          end_date: '2021',
          dates: '2018 - 2021'
        }
      ]
    }]);

    await writeTable('settings', [{
      daily_submission_quota: 5,
      privacy_consent: true
    }]);

    await writeTable('jobs', [
      {
        id: 201,
        title: 'Spécialiste Support IT & ServiceNow',
        company: 'Hôpital Riviera',
        location: 'Lausanne',
        canton: 'VD',
        url: `${baseUrl}/form-ok?job=201`,
        description: 'Nous recherchons un Spécialiste Support IT maîtrisant ServiceNow, Windows 11 et Active Directory pour notre équipe à Lausanne.',
        status: 'À postuler'
      },
      {
        id: 202,
        title: 'Technicien Helpdesk (Récapitulatif incomplet)',
        company: 'Clinique Test B',
        location: 'Genève',
        canton: 'GE',
        url: `${baseUrl}/form-incomplete?job=202`,
        description: 'Poste de Technicien Helpdesk N1/N2 avec gestion de parc informatique.',
        status: 'À postuler'
      },
      {
        id: 203,
        title: 'Technicien Support Informatique',
        company: 'Groupe Médical Romand',
        location: 'Morges',
        canton: 'VD',
        url: `${baseUrl}/form-ok?job=203`,
        description: 'Support informatique utilisateurs, ServiceNow et déploiement postes de travail Windows 11.',
        status: 'À postuler'
      },
      {
        id: 204,
        title: 'Ingénieur Support (Erreur Ollama)',
        company: 'Entreprise Test D',
        location: 'Nyon',
        canton: 'VD',
        url: `${baseUrl}/form-ok?job=204`,
        description: 'Description contenant SIMULATE_OLLAMA_ERROR pour tester la résilience de la campagne.',
        status: 'À postuler'
      },
      {
        id: 205,
        title: 'Poste Déjà Soumis',
        company: 'Entreprise Déjà Postulée',
        location: 'Lausanne',
        canton: 'VD',
        url: `${baseUrl}/form-ok?job=205`,
        description: 'Offre déjà postulée précédemment.',
        status: 'À postuler'
      }
    ]);

    await writeTable('applications', []);
    await clearCart();

    // -------------------------------------------------------------------------
    // TEST 1 : Génération, stockage et récupération du CV de base ATS-friendly
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1 : Extractor existant & CV de base ATS-friendly ---');
    const profile = readTable('user_profile')[0];
    const baseAts = await ensureAndGetBaseAtsCv(profile);
    assert(Boolean(baseAts.baseAtsFilename), `Nom de fichier CV de base ATS généré dynamiquement (${baseAts.baseAtsFilename})`);
    assert(fs.existsSync(baseAts.baseAtsPath), 'Le CV de base ATS est stocké sur le disque dans UPLOADS_DIR');
    assert(baseAts.baseAtsBuffer.slice(0, 4).toString('ascii') === '%PDF', 'Le CV de base ATS est un fichier PDF valide (%PDF)');

    // -------------------------------------------------------------------------
    // TEST 2 : Campagne sur UNE SEULE offre sélectionnée dans le panier (simulate: true)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2 : Campagne sur 1 seule offre sélectionnée dans le panier (simulate: true) ---');
    await addToCart(201);
    await addToCart(202);
    await addToCart(203);

    ollamaPrompts.length = 0;
    submittedRequests.length = 0;

    const singleSummary = await processCart({
      simulate: true,
      headless: true,
      pauseMs: 50,
      jobIds: [201]
    });

    assert(singleSummary.total_processed === 1, 'Une seule offre sélectionnée a été traitée (total_processed === 1)');
    assert(ollamaPrompts.length === 2, 'ollamaCloud.generate() a été appelé exactement 2 fois pour l’offre 201 (1x CV adapté + 1x Lettre)');
    assert(ollamaPrompts[0].includes('Spécialiste Support IT & ServiceNow'), 'Le 1er prompt Ollama contient le titre et la description de l’offre 201');
    assert(ollamaPrompts[1].includes('Spécialiste Support IT & ServiceNow'), 'Le 2e prompt Ollama (lettre) contient le titre et la description de l’offre 201');

    const status201 = singleSummary.item_statuses[201];
    assert(status201.cv_adapted_generated === true, 'Offre 201 : cv_adapted_generated === true');
    assert(status201.letter_generated === true, 'Offre 201 : letter_generated === true');
    assert(status201.upload_success === true, 'Offre 201 : upload_success === true');
    assert(status201.cv_uploaded === true, 'Offre 201 : cv_uploaded === true');
    assert(status201.letter_uploaded === true, 'Offre 201 : letter_uploaded === true');
    assert(status201.fields_filled?.includes('cover_letter_type_10'), 'Offre 201 : type="10" sélectionné pour la lettre de motivation');
    assert(status201.fields_filled?.includes('cover_letter_upload'), 'Offre 201 : PDF de la lettre téléversé');
    assert(status201.summary_complete === true, 'Offre 201 : récapitulatif vérifié au vert (summary_complete === true)');
    assert(status201.final_status === 'requires_review', 'Offre 201 : statut final requires_review en mode simulate: true');
    assert(submittedRequests.length === 0, 'Zéro soumission réelle effectuée en mode simulate: true');

    // Vérification anti-hallucination sur le PDF du CV adapté
    const tailoredCvPath201 = path.join(UPLOADS_DIR, status201.tailored_cv_filename!);
    const coverLetterPath201 = path.join(UPLOADS_DIR, status201.cover_letter_filename!);
    assert(fs.existsSync(tailoredCvPath201), 'Le fichier PDF du CV adapté existe physiquement');
    assert(fs.existsSync(coverLetterPath201), 'Le fichier PDF de la lettre de motivation existe physiquement');

    const parsedAdaptedPdf = await pdfParse(fs.readFileSync(tailoredCvPath201));
    assert(!parsedAdaptedPdf.text.includes('Compétence Inventée XYZ'), 'Aucune compétence inventée par le LLM n’est présente dans le PDF du CV adapté');

    // -------------------------------------------------------------------------
    // TEST 3 : Campagne sur PLUSIEURS offres avec échecs intermédiaires et continuation
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3 : Campagne multi-offres séquentielle avec suite après échec + already_submitted (simulate: true) ---');
    await clearCart();
    await addToCart(201);
    await addToCart(202); // Échec récapitulatif incomplet
    await addToCart(204); // Échec Ollama Cloud sur cette offre
    await addToCart(203); // Offre valide après les échecs

    // Ajoutons aussi une offre déjà envoyée dans applications (205) et forçons sa présence dans la table cart pour vérifier already_submitted
    await writeTable('applications', [{
      id: 9001,
      job_id: 205,
      title: 'Poste Déjà Soumis',
      company: 'Entreprise Déjà Postulée',
      status: 'Envoyée',
      created_at: new Date().toISOString(),
      sent_at: new Date().toISOString()
    }]);
    const currentCart = readTable('cart');
    await writeTable('cart', [
      ...currentCart,
      {
        job_id: 205,
        added_at: new Date().toISOString(),
        title: 'Poste Déjà Soumis',
        company: 'Entreprise Déjà Postulée'
      }
    ]);

    ollamaPrompts.length = 0;
    submittedRequests.length = 0;

    const multiSummary = await processCart({
      simulate: true,
      headless: true,
      pauseMs: 50
    });

    assert(multiSummary.total_processed === 5, `5 offres traitées séquentiellement (obtenu: ${multiSummary.total_processed})`);
    assert(multiSummary.review_count === 2, `2 offres simulées avec succès à vérifier (201 et 203) (obtenu: ${multiSummary.review_count})`);
    assert(multiSummary.failed_count === 2, `2 offres en échec (202 et 204) sans bloquer les suivantes (obtenu: ${multiSummary.failed_count})`);
    assert(multiSummary.already_submitted_count === 1, `1 offre déjà soumise détectée (205) (obtenu: ${multiSummary.already_submitted_count})`);
    assert(submittedRequests.length === 0, 'Zéro soumission réelle sur toute la campagne en mode simulate: true');

    // Vérification détaillée par offre
    const s202 = multiSummary.item_statuses[202];
    assert(s202.final_status === 'failed', 'Offre 202 (récapitulatif incomplet) a le statut final failed');
    assert(s202.summary_complete === false, 'Offre 202 : summary_complete === false');
    assert(Boolean(s202.blocked_reason), `Offre 202 : raison exacte enregistrée (${s202.blocked_reason})`);

    const s204 = multiSummary.item_statuses[204];
    assert(s204.final_status === 'failed', 'Offre 204 (erreur Ollama) a le statut final failed');
    assert(Boolean(s204.blocked_reason && s204.blocked_reason.includes('Échec simulé Ollama Cloud')), 'Offre 204 : raison exacte de l’erreur Ollama enregistrée');

    const s203 = multiSummary.item_statuses[203];
    assert(s203.cv_adapted_generated === true && s203.letter_generated === true, 'Offre 203 (après les échecs 202 et 204) a bien généré son CV adapté et sa lettre PDF');
    assert(s203.upload_success === true && s203.summary_complete === true, 'Offre 203 : upload_success === true et summary_complete === true');
    assert(s203.final_status === 'requires_review', 'Offre 203 : statut final requires_review');

    const s205 = multiSummary.item_statuses[205];
    assert(s205.final_status === 'already_submitted', 'Offre 205 : statut final already_submitted');

    console.log('\n🎉 TOUS LES TESTS DE CAMPAGNE PANIER + OLLAMA CLOUD SONT PASSÉS AVEC SUCCÈS !');
  } finally {
    (ollamaCloud as any).generate = originalGenerate;
    server.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Erreur fatale dans le test :', err);
  process.exit(1);
});
