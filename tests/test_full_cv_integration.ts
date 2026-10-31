import { parseCvText } from "../src/services/cvParser";

const realCvJeanDesfontaines = `
JEAN DESFONTAINES
+41 (0) 76 639 75 60
jean.desfontaines@me.com
rue des voisins 8, 1205 Genève
ACCOUNT EXECUTIVE
Nationalité Française
Résident Suisse (permis B)
01 janvier 1991 (34 ans)
PROFILE
Je suis spécialisé dans la gestion de comptes stratégiques et l’implémentation de solutions digitales.
Passionné par le développement de relations de confiance à long terme et l’optimisation de
l’expérience client, je souhaite évoluer vers un poste qui allie innovation et excellence opérationnelle.
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
- Projets SaaS/IoT
- Automatisation
- Coordination équipes
- Négociation
- Analyse KPI
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
- Encadré une équipe de 3 collaborateurs (recrutement, formation, suivi KPI)
- Optimisé les conversions et revenus sur 900+ réservations mensuelles
Staylike·Exploitation locative meublée ·Londres, Royaume-Uni 04/2015 - 09/2017
Co-fondateur & directeur général
- Défini et dirigé la stratégie globale : offre, vision produit, performance opérationnelle
- Structuré l’expérience client : réservation, communication, paiements
- Mis en place les processus internes et dirigé une équipe hybride
LOGICIELS
- Salesforce – Hubspot
- Asana – Slack – Notion
- Mavenoid – Zapier
- Microsoft 365
- Google Workspace
Miki Travel·Grossiste & Tour opérateur B2B·Londres, Royaume-Uni 03/2015 - 11/2016
Responsable Groupes Asie (Paris & IDF)
- Géré les relations entre 160+ hôtels parisiens et 30+ agences japonaises
- Renégocié les conditions d’annulation/modification (volumes 100 000+ CHF/mois)
Holiday Agent Nice·Gestion locative meublée ·Nice, France 01/2013 - 02/2015
Co-fondateur
- Créé et développer un portefeuille de 148+ appartements (France, Italie, Espagne)
- Négocié des accords avec Booking.com, Expedia et géré les opérations terrain
- Dirigé la stratégie marketing : site web, contenus, acquisition client
DIPLÔMES
BTS Commerce
Émile Dubois, Paris, France
Équivalent au Brevet Fédéral
09/2010 – 07/2012
BAC PRO Commerce
Pierre Lescot, Paris, France
Équivalent au CFC
09/2008 – 07/2010
BEP Comptabilité
Gustave Eiffel, Paris, France
Équivalent à l’AFP
09/2006 – 07/2008
`;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log("=== TEST 1: PARSING REAL CV OF JEAN DESFONTAINES ===");
const parsed = parseCvText(realCvJeanDesfontaines);

// Check identity
assert(parsed.first_name === "Jean", `First name is Jean (got: ${parsed.first_name})`);
assert(parsed.last_name === "Desfontaines", `Last name is Desfontaines (got: ${parsed.last_name})`);
assert(parsed.email === "jean.desfontaines@me.com", `Email matches (got: ${parsed.email})`);
assert(parsed.phone === "+41 (0) 76 639 75 60", `Phone matches (got: ${parsed.phone})`);
assert(parsed.current_title === "ACCOUNT EXECUTIVE", `Current title matches (got: ${parsed.current_title})`);

// Check experiences count
assert(parsed.experiences.length === 6, `Found exactly 6 experiences (got: ${parsed.experiences.length})`);

// Check Experience 1: eEAT
const exp1 = parsed.experiences[0];
assert(exp1.company === "eEAT", `Exp 1 company is eEAT (got: ${exp1.company})`);
assert(exp1.title === "Account manager", `Exp 1 title is Account manager (got: ${exp1.title})`);
assert(exp1.start_date === "03/2022", `Exp 1 start_date is 03/2022 (got: ${exp1.start_date})`);
assert(exp1.end_date === "01/2025", `Exp 1 end_date is 01/2025 (got: ${exp1.end_date})`);
assert(exp1.realizations.length === 4, `Exp 1 has 4 realizations (got: ${exp1.realizations.length})`);
assert(exp1.realizations[0].includes("taux de rétention de 98 %"), "Exp 1 realization 1 correct");
assert(exp1.realizations[3].includes("centre d’aide digital"), "Exp 1 realization 4 correct");

// Check Experience 2: Urban Stay
const exp2 = parsed.experiences[1];
assert(exp2.company === "Urban Stay", `Exp 2 company is Urban Stay (got: ${exp2.company})`);
assert(exp2.title === "Responsable des opérations", `Exp 2 title is Responsable des opérations (got: ${exp2.title})`);
assert(exp2.start_date === "03/2019", `Exp 2 start_date is 03/2019 (got: ${exp2.start_date})`);
assert(exp2.end_date === "11/2019", `Exp 2 end_date is 11/2019 (got: ${exp2.end_date})`);
assert(exp2.realizations.length === 2, `Exp 2 has 2 realizations (got: ${exp2.realizations.length})`);

// Check Experience 3: Allstay
const exp3 = parsed.experiences[2];
assert(exp3.company === "Allstay", `Exp 3 company is Allstay (got: ${exp3.company})`);
assert(exp3.title === "Responsable des relations clients", `Exp 3 title is Responsable des relations clients (got: ${exp3.title})`);
assert(exp3.start_date === "01/2018", `Exp 3 start_date is 01/2018 (got: ${exp3.start_date})`);
assert(exp3.end_date === "02/2019", `Exp 3 end_date is 02/2019 (got: ${exp3.end_date})`);
assert(exp3.realizations.length === 3, `Exp 3 has 3 realizations (got: ${exp3.realizations.length})`);

// Check Experience 4: Staylike
const exp4 = parsed.experiences[3];
assert(exp4.company === "Staylike", `Exp 4 company is Staylike (got: ${exp4.company})`);
assert(exp4.title === "Co-fondateur & directeur général", `Exp 4 title is Co-fondateur & directeur général (got: ${exp4.title})`);
assert(exp4.start_date === "04/2015", `Exp 4 start_date is 04/2015 (got: ${exp4.start_date})`);
assert(exp4.end_date === "09/2017", `Exp 4 end_date is 09/2017 (got: ${exp4.end_date})`);
assert(exp4.realizations.length === 3, `Exp 4 has 3 realizations (got: ${exp4.realizations.length})`);

// Check Experience 5: Miki Travel
const exp5 = parsed.experiences[4];
assert(exp5.company === "Miki Travel", `Exp 5 company is Miki Travel (got: ${exp5.company})`);
assert(exp5.title === "Responsable Groupes Asie (Paris & IDF)", `Exp 5 title is Responsable Groupes Asie (Paris & IDF) (got: ${exp5.title})`);
assert(exp5.start_date === "03/2015", `Exp 5 start_date is 03/2015 (got: ${exp5.start_date})`);
assert(exp5.end_date === "11/2016", `Exp 5 end_date is 11/2016 (got: ${exp5.end_date})`);
assert(exp5.realizations.length === 2, `Exp 5 has 2 realizations (got: ${exp5.realizations.length})`);

// Check Experience 6: Holiday Agent Nice
const exp6 = parsed.experiences[5];
assert(exp6.company === "Holiday Agent Nice", `Exp 6 company is Holiday Agent Nice (got: ${exp6.company})`);
assert(exp6.title === "Co-fondateur", `Exp 6 title is Co-fondateur (got: ${exp6.title})`);
assert(exp6.start_date === "01/2013", `Exp 6 start_date is 01/2013 (got: ${exp6.start_date})`);
assert(exp6.end_date === "02/2015", `Exp 6 end_date is 02/2015 (got: ${exp6.end_date})`);
assert(exp6.realizations.length === 3, `Exp 6 has 3 realizations (got: ${exp6.realizations.length})`);

// Check Formations
assert(parsed.formations.length === 3, `Found exactly 3 formations (got: ${parsed.formations.length})`);
assert(parsed.formations[0].diploma === "BTS Commerce", `Form 1 diploma is BTS Commerce (got: ${parsed.formations[0].diploma})`);
assert(parsed.formations[0].institution === "Émile Dubois", `Form 1 institution is Émile Dubois (got: ${parsed.formations[0].institution})`);
assert(parsed.formations[0].start_date === "09/2010", `Form 1 start_date is 09/2010 (got: ${parsed.formations[0].start_date})`);
assert(parsed.formations[0].end_date === "07/2012", `Form 1 end_date is 07/2012 (got: ${parsed.formations[0].end_date})`);

assert(parsed.formations[1].diploma === "BAC PRO Commerce", `Form 2 diploma is BAC PRO Commerce (got: ${parsed.formations[1].diploma})`);
assert(parsed.formations[1].institution === "Pierre Lescot", `Form 2 institution is Pierre Lescot (got: ${parsed.formations[1].institution})`);
assert(parsed.formations[1].start_date === "09/2008", `Form 2 start_date is 09/2008 (got: ${parsed.formations[1].start_date})`);
assert(parsed.formations[1].end_date === "07/2010", `Form 2 end_date is 07/2010 (got: ${parsed.formations[1].end_date})`);

assert(parsed.formations[2].diploma === "BEP Comptabilité", `Form 3 diploma is BEP Comptabilité (got: ${parsed.formations[2].diploma})`);
assert(parsed.formations[2].institution === "Gustave Eiffel", `Form 3 institution is Gustave Eiffel (got: ${parsed.formations[2].institution})`);
assert(parsed.formations[2].start_date === "09/2006", `Form 3 start_date is 09/2006 (got: ${parsed.formations[2].start_date})`);
assert(parsed.formations[2].end_date === "07/2008", `Form 3 end_date is 07/2008 (got: ${parsed.formations[2].end_date})`);

// Check Skills & Languages isolation
assert(parsed.skills.includes("Gestion de comptes"), "Skills contains Gestion de comptes");
assert(parsed.skills.includes("Salesforce – Hubspot"), "Skills contains Salesforce – Hubspot");
assert(!parsed.skills.some(s => s.includes("Urban Stay") || s.includes("Holiday Agent")), "Skills contains NO experiences");
assert(!parsed.languages.includes("Allstay"), "Languages contains NO experiences");

console.log("\n=== TEST 2: VARIOUS DATE FORMATS ===");
const dateCv = `
EXPERIENCES
Company A · Zurich 03/2019 – 11/2019
Developer
- Built React app
Company B · Geneve Jan 2018 - Feb 2019
Lead Developer
- Led 5 engineers
Company C · Lausanne 2015 - 2017
Software Engineer
- Python backend
Company D · Bern 2022 - Présent
Senior Engineer
- Cloud systems
`;
const parsedDate = parseCvText(dateCv);
assert(parsedDate.experiences.length === 4, `Date test extracted 4 experiences (got: ${parsedDate.experiences.length})`);
assert(parsedDate.experiences[0].start_date === "03/2019" && parsedDate.experiences[0].end_date === "11/2019", "En-dash dates parsed correctly");
assert(parsedDate.experiences[1].start_date === "01/2018" && parsedDate.experiences[1].end_date === "02/2019", "Jan 2018 - Feb 2019 parsed correctly");
assert(parsedDate.experiences[2].start_date === "2015" && parsedDate.experiences[2].end_date === "2017", "Year-only dates parsed correctly");
assert(parsedDate.experiences[3].start_date === "2022" && parsedDate.experiences[3].end_date === "Présent", "Présent date parsed correctly");

console.log("\n=== TEST 3: VARIOUS BULLET MARKERS ===");
const bulletCv = `
EXPERIENCES
Company Bullet · Paris 2020 - 2022
Engineer
• Bullet circle item
● Bullet disk item
▪ Square item
- Dash item
1. Numbered item
`;
const parsedBullet = parseCvText(bulletCv);
assert(parsedBullet.experiences[0].realizations.length === 5, `Extracted 5 bullet variations (got: ${parsedBullet.experiences[0].realizations.length})`);
assert(parsedBullet.experiences[0].realizations[0] === "Bullet circle item", "Bullet circle cleaned");
assert(parsedBullet.experiences[0].realizations[1] === "Bullet disk item", "Bullet disk cleaned");
assert(parsedBullet.experiences[0].realizations[2] === "Square item", "Square bullet cleaned");
assert(parsedBullet.experiences[0].realizations[3] === "Dash item", "Dash bullet cleaned");
assert(parsedBullet.experiences[0].realizations[4] === "Numbered item", "Numbered item cleaned");

console.log("\n=== TEST 4: LEGACY PROFILE MIGRATION SIMULATION ===");
// Case A: Legacy profile with experiences as string
const legacyStringProfile: any = {
  first_name: "Jean",
  experiences: "5 ans chez eEAT et Urban Stay",
  formations: "BTS Commerce"
};
const migratedA = {
  experiences: Array.isArray(legacyStringProfile.experiences)
    ? legacyStringProfile.experiences
    : (typeof legacyStringProfile.experiences === 'string'
        ? [{ company: 'Profil Hérité', title: 'Importé', location: 'N/A', start_date: 'N/A', end_date: 'N/A', realizations: [legacyStringProfile.experiences] }]
        : []),
  formations: Array.isArray(legacyStringProfile.formations)
    ? legacyStringProfile.formations
    : (typeof legacyStringProfile.formations === 'string'
        ? [{ diploma: legacyStringProfile.formations, institution: 'Profil Hérité', location: 'N/A', start_date: 'N/A', end_date: 'N/A' }]
        : [])
};
assert(migratedA.experiences[0].realizations[0] === "5 ans chez eEAT et Urban Stay", "Legacy text preserved without loss");

// Case B: Legacy profile with old 'dates' string and 'description'
const legacyObjectProfile: any = {
  experiences: [
    { company: "OldCorp", title: "Dev", dates: "2019 - 2021", description: "Worked on API\nFixed bugs" }
  ]
};
const migratedB = {
  experiences: legacyObjectProfile.experiences.map((exp: any) => ({
    company: exp.company || '',
    title: exp.title || '',
    location: exp.location || '',
    start_date: exp.start_date || (exp.dates ? exp.dates.split(/[-–—]/)[0]?.trim() : '') || '',
    end_date: exp.end_date || (exp.dates ? exp.dates.split(/[-–—]/)[1]?.trim() : '') || '',
    realizations: Array.isArray(exp.realizations)
      ? exp.realizations
      : (Array.isArray(exp.achievements)
          ? exp.achievements
          : (exp.description ? exp.description.split('\n').filter(Boolean) : []))
  }))
};
assert(migratedB.experiences[0].start_date === "2019", "Migrated start_date is 2019");
assert(migratedB.experiences[0].end_date === "2021", "Migrated end_date is 2021");
assert(migratedB.experiences[0].realizations.length === 2, "Migrated 2 realization lines from description");

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n");
