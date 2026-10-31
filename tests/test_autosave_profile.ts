import axios from "axios";
import { parseCvText } from "../src/services/cvParser";
import { UserProfile, Experience, Formation } from "../src/types";

const BASE_URL = "http://localhost:3000";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

async function runTests() {
  console.log("=== TEST AUTOSAVE & PROFILE PERSISTENCE ===");

  // 1. Test parsing Jean Desfontaines CV
  const sampleCv = `
JEAN DESFONTAINES
+41 (0) 76 639 75 60
jean.desfontaines@me.com
rue des voisins 8, 1205 Genève
ACCOUNT EXECUTIVE
PARCOURS & RÉALISATIONS
eEAT·Food-tech & solutions HACCP digitales·Nyon (VD), Suisse 03/2022 - 01/2025
Account manager
- Garanti un taux de rétention de 98 % sur un portefeuille de 500+ clients
- Piloté l’onboarding clients : déployé 8 000+ capteurs IoT et 1 000+ applications
- Conçu et animé 350+ formations hybrides pour 1 500+ professionnels
- Créé un centre d’aide digital de 54 articles : -35 % de tickets et 98 % de satisfaction
COMPÉTENCES
- Gestion de comptes
- Onboarding client
Urban Stay·Séjours corporate & relocation·Londres, Royaume-Uni 03/2019 - 11/2019
Responsable des opérations
- Augmenté la satisfaction client de 10 % en 5 mois via un système NPS
- Piloté les opérations de 200+ appartements (20+ prestataires, 95 % d’occupation)
LANGUES
- Français
langue maternelle
- Anglais
bilingue (C2)
Allstay·Séjours corporate & relocation·Londres, Royaume-Uni 01/2018 - 02/2019
Responsable des relations clients
- Développé un réseau de 70+ partenaires B2B (contrats, négociation, fidélisation)
Staylike·Exploitation locative meublée ·Londres, Royaume-Uni 04/2015 - 09/2017
Co-fondateur & directeur général
- Défini et dirigé la stratégie globale : offre, vision produit, performance opérationnelle
LOGICIELS
- Salesforce – Hubspot
- Asana – Slack – Notion
Miki Travel·Grossiste & Tour opérateur B2B·Londres, Royaume-Uni 03/2015 - 11/2016
Responsable Groupes Asie (Paris & IDF)
- Géré les relations entre 160+ hôtels parisiens et 30+ agences japonaises
Holiday Agent Nice·Gestion locative meublée ·Nice, France 01/2013 - 02/2015
Co-fondateur
- Créé et développer un portefeuille de 148+ appartements (France, Italie, Espagne)
DIPLÔMES
BTS Commerce
Émile Dubois, Paris, France
09/2010 – 07/2012
BAC PRO Commerce
Pierre Lescot, Paris, France
09/2008 – 07/2010
BEP Comptabilité
Gustave Eiffel, Paris, France
09/2006 – 07/2008
`;

  // Parse CV
  const parsed = parseCvText(sampleCv);
  assert(parsed.experiences.length === 6, `Parsed exactly 6 experiences (got ${parsed.experiences.length})`);
  assert(parsed.formations.length === 3, `Parsed exactly 3 formations (got ${parsed.formations.length})`);

  // 2. Test saving parsed profile via PUT /api/profile
  const profileToSave: UserProfile = {
    first_name: parsed.first_name || 'Jean',
    last_name: parsed.last_name || 'Desfontaines',
    email: parsed.email || 'jean.desfontaines@me.com',
    phone: parsed.phone || '+41 76 639 75 60',
    city: parsed.city || 'Genève',
    canton: 'GE',
    cv_filename: 'cv_jean.pdf',
    cover_template: 'standard',
    current_title: parsed.current_title || 'Account Executive',
    skills: parsed.skills || ['Salesforce', 'Hubspot', 'Gestion de comptes'],
    experiences: parsed.experiences,
    formations: parsed.formations,
    languages: parsed.languages || 'Français, Anglais',
    diplomas: 'BTS Commerce, BAC PRO Commerce',
    years_experience: '12 ans',
    sectors: ['SaaS', 'IoT'],
    wanted_roles: ['Account Executive', 'Key Account Manager'],
    wanted_cantons: ['GE', 'VD'],
    contract_types: ['CDI'],
    remote_accepted: true,
    workload: '100%',
    salary_min: '120000',
    positive_keywords: ['Account Management', 'SaaS', 'B2B'],
    negative_keywords: ['PHP', 'Junior'],
    avoided_companies: []
  };

  const putRes = await axios.put(`${BASE_URL}/api/profile`, profileToSave);
  assert(putRes.data.success === true, `PUT /api/profile responded with success`);

  // 3. Test reloading from GET /api/profile
  const getRes = await axios.get(`${BASE_URL}/api/profile`);
  const loaded = getRes.data as UserProfile;
  assert(loaded.first_name === 'Jean', `Loaded first_name is Jean`);
  assert(loaded.last_name === 'Desfontaines', `Loaded last_name is Desfontaines`);
  assert(loaded.experiences.length === 6, `Loaded 6 experiences`);
  assert(loaded.experiences[0].company === 'eEAT', `Exp 1 company is eEAT`);
  assert(loaded.experiences[0].realizations.length === 4, `Exp 1 has 4 realizations`);
  assert(loaded.formations.length === 3, `Loaded 3 formations`);
  assert(loaded.formations[0].diploma === 'BTS Commerce', `Formation 1 diploma is BTS Commerce`);

  // 4. Test incremental update (autosave simulation on a single field change)
  const updatedProfile: UserProfile = {
    ...loaded,
    salary_min: '130000',
    current_title: 'Senior Account Executive'
  };
  const updateRes = await axios.put(`${BASE_URL}/api/profile`, updatedProfile);
  assert(updateRes.data.success === true, `Autosave incremental update succeeded`);

  const reloaded = (await axios.get(`${BASE_URL}/api/profile`)).data as UserProfile;
  assert(reloaded.salary_min === '130000', `Reloaded salary_min is 130000`);
  assert(reloaded.current_title === 'Senior Account Executive', `Reloaded current_title is Senior Account Executive`);
  assert(reloaded.experiences.length === 6, `Experiences retained intact after incremental autosave`);

  // 5. Test beacon POST /api/profile
  const postRes = await axios.post(`${BASE_URL}/api/profile`, {
    ...reloaded,
    city: 'Genève (Centre)'
  });
  assert(postRes.data.success === true, `POST /api/profile (beacon/unload handler) succeeded`);
  const finalLoaded = (await axios.get(`${BASE_URL}/api/profile`)).data as UserProfile;
  assert(finalLoaded.city === 'Genève (Centre)', `Beacon-persisted city is correctly saved`);

  console.log("🎉 ALL AUTOSAVE & PERSISTENCE TESTS PASSED!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
