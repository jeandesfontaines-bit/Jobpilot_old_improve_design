import assert from 'node:assert';
import { evaluateJobFilters, parseWorkloadRange, extractAnnualSalary, checkJobRelevance } from '../src/services/jobFilterEngine.ts';
import { cleanJobTitleForExclusion, getDistinctiveShortcut, checkRoleConflict } from '../src/services/exclusionMatcher.ts';
import { cleanCompanyName } from '../src/services/swissJobHelpers.ts';

console.log('=== TEST SUITE : JobFilterEngine (Corrections Points 1, 2, 3 & Matching/Nettoyage) ===');

// ─────────────────────────────────────────────────────────────────────────────
// 1. TESTS TAUX D’OCCUPATION (Point 1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 1. Tests Taux d’occupation ---');

// A. Parsing strict du champ workload
assert.deepStrictEqual(parseWorkloadRange('100%'), [100, 100]);
assert.deepStrictEqual(parseWorkloadRange('100 %'), [100, 100]);
assert.deepStrictEqual(parseWorkloadRange('80–100 %'), [80, 100]);
assert.deepStrictEqual(parseWorkloadRange('80 à 100 %'), [80, 100]);
assert.deepStrictEqual(parseWorkloadRange('80-100%'), [80, 100]);
assert.deepStrictEqual(parseWorkloadRange('50-80%'), [50, 80]);
assert.deepStrictEqual(parseWorkloadRange('temps plein'), [100, 100]);
assert.deepStrictEqual(parseWorkloadRange('temps complet'), [100, 100]);
assert.deepStrictEqual(parseWorkloadRange('temps partiel'), [50, 80]);
assert.deepStrictEqual(parseWorkloadRange('teilzeit'), [50, 80]);
assert.strictEqual(parseWorkloadRange(''), null);
assert.strictEqual(parseWorkloadRange(undefined), null);
assert.strictEqual(parseWorkloadRange(null), null);
console.log('  ✓ Parsing strict de parseWorkloadRange validé');

// B. Tests négatifs : description avec chiffres divers ne doit JAMAIS produire de taux
assert.strictEqual(parseWorkloadRange('3 ans d’expérience'), null);
assert.strictEqual(parseWorkloadRange('50 clients'), null);
assert.strictEqual(parseWorkloadRange('2026'), null);
assert.strictEqual(parseWorkloadRange("CHF 120'000"), null);
console.log('  ✓ Tests négatifs : 3 ans, 50 clients, 2026, CHF 120\'000 ne produisent aucun taux');

// C. Filtrage d’offres avec seuil max 90%
const profileWorkload90 = { workload: '90%' };

// Offre avec workload vide mais description contenant des chiffres pièges -> doit être CONSERVÉE
const jobNoWorkloadTrapDesc = {
  title: 'Account Executive',
  canton: 'GE',
  workload: '',
  description: 'Exige au minimum 3 ans d’expérience, gestion de 50 clients actifs en 2026, budget CHF 120\'000.'
};
const resTrap = evaluateJobFilters(jobNoWorkloadTrapDesc, profileWorkload90);
assert.strictEqual(resTrap.isExcluded, false, 'Workload vide avec description piégée doit être conservée');
console.log('  ✓ Workload vide avec chiffres dans la description : conservée sans faux positif');

// Offre 80-100% avec max 90% -> CONSERVÉE (permet de travailler à 90% ou moins)
const job80_100 = { title: 'Account Executive', canton: 'GE', workload: '80–100 %' };
assert.strictEqual(evaluateJobFilters(job80_100, profileWorkload90).isExcluded, false, '80-100% conservée');
console.log('  ✓ Offre 80–100% avec max 90% : conservée');

// Offre 100% strict avec max 90% -> EXCLUE
const job100 = { title: 'Account Executive', canton: 'GE', workload: '100%' };
const res100 = evaluateJobFilters(job100, profileWorkload90);
assert.strictEqual(res100.isExcluded, true, '100% strict exclue');
assert.ok(res100.primaryReason?.includes('supérieur au maximum souhaité (90%)'));
console.log('  ✓ Offre 100% strict avec max 90% : exclue avec motif explicite');

// ─────────────────────────────────────────────────────────────────────────────
// 2. TESTS SALAIRE ANNUEL (Point 2)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 2. Tests Salaire annuel ---');

// A. Tous les formats de salaire valides
assert.strictEqual(extractAnnualSalary('120000'), 120000);
assert.strictEqual(extractAnnualSalary("120'000"), 120000);
assert.strictEqual(extractAnnualSalary('120 000'), 120000);
assert.strictEqual(extractAnnualSalary('120k'), 120000);
assert.strictEqual(extractAnnualSalary('120K'), 120000);
assert.strictEqual(extractAnnualSalary("CHF 120'000.–"), 120000);
assert.strictEqual(extractAnnualSalary("120'000 CHF"), 120000);
assert.strictEqual(extractAnnualSalary('120k CHF'), 120000);
assert.strictEqual(extractAnnualSalary('120 000.-'), 120000);
assert.strictEqual(extractAnnualSalary(120000), 120000);
console.log('  ✓ Tous les formats de montants suisses (120000, 120\'000, 120k, 120 000.-, etc.) sont reconnus');

// B. Salaire mensuel converti x12 (documenté)
const monthlySalary = extractAnnualSalary('8000 CHF / mois');
assert.strictEqual(monthlySalary, 96000, '8000 CHF / mois doit être annualisé à 96000 CHF');
const monthlySalary2 = extractAnnualSalary('7500.- par mois');
assert.strictEqual(monthlySalary2, 90000, '7500.- par mois doit être annualisé à 90000 CHF');
console.log('  ✓ Salaire mensuel (ex: 8000 CHF / mois) distingué et annualisé à 96000 CHF');

// C. Fourchette salariale : utilisation explicite de la borne inférieure
const rangeSalary = extractAnnualSalary("110'000 - 130'000 CHF");
assert.strictEqual(rangeSalary, 110000, 'Fourchette 110k-130k doit retenir 110k pour le seuil minimum');
console.log('  ✓ Fourchette salariale (110k - 130k) : borne inférieure (110k) retenue');

// D. Tests négatifs : nombres sans contexte salarial ou faux positifs (budget, chiffre d'affaires, dates, références)
assert.strictEqual(extractAnnualSalary(undefined, "budget CHF 80'000"), null);
assert.strictEqual(extractAnnualSalary(undefined, "chiffre d'affaires CHF 2'000'000"), null);
assert.strictEqual(extractAnnualSalary(undefined, "L'équipe dispose d'un budget CHF 80'000 pour les outils"), null);
assert.strictEqual(extractAnnualSalary(undefined, "Entreprise avec un chiffre d'affaires CHF 2'000'000 en Suisse"), null);
assert.strictEqual(extractAnnualSalary(undefined, 'Projet Alpha réf: 120000 en production'), null);
assert.strictEqual(extractAnnualSalary(undefined, 'Projet initié en 2026 avec 50 clients'), null);
assert.strictEqual(extractAnnualSalary(undefined, 'Contactez le 022 120 000 pour plus d’informations'), null);
console.log('  ✓ Tests négatifs : budget CHF 80\'000, chiffre d\'affaires CHF 2\'000\'000, réf, année, tél : tous rejetés (null)');

// D bis. Tests positifs avec contexte explicite dans le texte libre
assert.strictEqual(extractAnnualSalary(undefined, "Salaire attractif : CHF 120'000.–"), 120000);
assert.strictEqual(extractAnnualSalary(undefined, "Rémunération de 110'000 à 130'000 CHF"), 110000);
assert.strictEqual(extractAnnualSalary(undefined, "Gehalt: 120k CHF pro Jahr"), 120000);
assert.strictEqual(extractAnnualSalary(undefined, "120'000 CHF par an"), 120000);
assert.strictEqual(extractAnnualSalary(undefined, "Rémunération de 8000 CHF par mois"), 96000);
console.log('  ✓ Tests positifs : Contexte salarial explicite (salaire, rémunération, Gehalt, par an/mois) correctement extrait');

// E. Filtrage d’offres par rapport au seuil de salaire minimum (120'000 CHF)
const profileSalary120k = { salary_min: 120000 };

// Salaire absent -> CONSERVÉE
const jobNoSalary = { title: 'Account Executive', canton: 'GE' };
assert.strictEqual(evaluateJobFilters(jobNoSalary, profileSalary120k).isExcluded, false, 'Salaire absent = conservée');

// Salaire mensuel 8'000 CHF / mois (96k annuel) < 120k seuil -> EXCLUE
const jobMonthlyLow = { title: 'Account Executive', canton: 'GE', salary: '8000 CHF / mois' };
const resMonthly = evaluateJobFilters(jobMonthlyLow, profileSalary120k);
assert.strictEqual(resMonthly.isExcluded, true, '8000 CHF/mois (96k) < 120k seuil doit être exclue');
assert.ok(resMonthly.primaryReason?.includes('96\u202f000') || resMonthly.primaryReason?.includes('96000') || resMonthly.primaryReason?.includes('96'));

// Fourchette 110k-130k avec seuil 120k -> borne inf 110k < 120k -> EXCLUE
const jobRangeLow = { title: 'Account Executive', canton: 'GE', salary: "110'000 - 130'000 CHF" };
assert.strictEqual(evaluateJobFilters(jobRangeLow, profileSalary120k).isExcluded, true, 'Fourchette min 110k < 120k exclue');

// Fourchette 125k-145k avec seuil 120k -> borne inf 125k >= 120k -> CONSERVÉE
const jobRangeHigh = { title: 'Account Executive', canton: 'GE', salary: "125'000 - 145'000 CHF" };
assert.strictEqual(evaluateJobFilters(jobRangeHigh, profileSalary120k).isExcluded, false, 'Fourchette min 125k >= 120k conservée');

// Seuil de salaire vide -> CONSERVÉE
const profileNoSalary = { salary_min: '' };
assert.strictEqual(evaluateJobFilters(jobMonthlyLow, profileNoSalary).isExcluded, false, 'Seuil vide = aucune exclusion');
console.log('  ✓ Filtrage salaire (absent, mensuel, fourchette, seuil vide) validé');

// ─────────────────────────────────────────────────────────────────────────────
// 3. TESTS CANTONS (Point 3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 3. Tests Cantons ---');

// A. wanted_cantons vide ou absent : AUCUNE restriction géographique (pas de fallback hardcodé GE/VD)
const profileEmptyCantons = { wanted_cantons: [] };
const jobZH = { title: 'Sales Director', canton: 'ZH' };
const jobBE = { title: 'Sales Director', canton: 'BE' };
assert.strictEqual(evaluateJobFilters(jobZH, profileEmptyCantons).isExcluded, false, 'ZH conservé si wanted_cantons vide');
assert.strictEqual(evaluateJobFilters(jobBE, profileEmptyCantons).isExcluded, false, 'BE conservé si wanted_cantons vide');

const profileUndefinedCantons = {};
assert.strictEqual(evaluateJobFilters(jobZH, profileUndefinedCantons).isExcluded, false, 'ZH conservé si wanted_cantons absent');
console.log('  ✓ Suppression du fallback GE/VD : wanted_cantons vide = aucune restriction');

// B. wanted_cantons renseigné : conserve UNIQUEMENT les cantons autorisés
const profileGE_VD = { wanted_cantons: ['GE', 'VD'] };
const jobGE = { title: 'Sales Rep', canton: 'GE' };
const jobVD = { title: 'Sales Rep', canton: 'VD' };
assert.strictEqual(evaluateJobFilters(jobGE, profileGE_VD).isExcluded, false, 'GE conservé');
assert.strictEqual(evaluateJobFilters(jobVD, profileGE_VD).isExcluded, false, 'VD conservé');

const resZH_Excluded = evaluateJobFilters(jobZH, profileGE_VD);
assert.strictEqual(resZH_Excluded.isExcluded, true, 'ZH exclu car non présent dans GE/VD');
assert.ok(resZH_Excluded.primaryReason?.includes('Canton non retenu (ZH)'));
console.log('  ✓ wanted_cantons renseigné (GE/VD) : filtre strictement les autres cantons');

// C. Canton absent ou non reconnu : ne PAS exclure, mais marquer isCantonUnknown = true
const jobUnknownCanton1 = { title: 'Sales Rep', canton: '' };
const resUnknown1 = evaluateJobFilters(jobUnknownCanton1, profileGE_VD);
assert.strictEqual(resUnknown1.isExcluded, false, 'Canton vide non exclu');
assert.strictEqual(resUnknown1.isCantonUnknown, true, 'isCantonUnknown = true');

const jobUnknownCanton2 = { title: 'Sales Rep', canton: 'SUISSE' };
const resUnknown2 = evaluateJobFilters(jobUnknownCanton2, profileGE_VD);
assert.strictEqual(resUnknown2.isExcluded, false, 'Canton "SUISSE" non exclu');
assert.strictEqual(resUnknown2.isCantonUnknown, true, 'isCantonUnknown = true');
console.log('  ✓ Canton inconnu ou non renseigné : non exclu, correctement étiqueté isCantonUnknown = true');

// D. Canton exclu explicitement via excluded_cantons
const profileWithExcludedCanton = { wanted_cantons: [], excluded_cantons: ['VS'] };
const jobVS = { title: 'Sales Rep', canton: 'VS' };
const resVS = evaluateJobFilters(jobVS, profileWithExcludedCanton);
assert.strictEqual(resVS.isExcluded, true, 'VS exclu explicitement');
assert.ok(resVS.primaryReason?.includes('Canton exclu expressément : VS'));
console.log('  ✓ Canton exclu explicitement via excluded_cantons : exclu avec motif');

// ─────────────────────────────────────────────────────────────────────────────
// 4. TESTS MATCHING MÉTIER & CONTRÔLE DE PERTINENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 4. Tests Matching Métier & Pertinence ---');

const jeanProfile = {
  current_title: 'Senior Account Executive',
  wanted_roles: ['Account Executive', 'Key Account Manager', 'Head of Sales', 'Business Development Manager'],
  skills: ['SaaS', 'B2B', 'Salesforce', 'Hubspot', 'Négociation', 'Closing', 'Prospection'],
  positive_keywords: ['Software', 'Enterprise', 'Cloud'],
  experiences: [
    { title: 'Account Executive', company: 'Tech Corp' },
    { title: 'Responsable des opérations commerciales', company: 'Startup SA' }
  ],
  wanted_cantons: ['GE', 'VD']
};

// A. Rôles cibles ou compétences correspondantes -> Éligible
const jobMatchingRole = {
  title: 'Senior Account Executive B2B',
  company: 'Swiss Cloud SA',
  canton: 'GE',
  description: 'Nous cherchons un Senior Account Executive pour piloter les ventes d’entreprises.'
};
const relMatchRole = checkJobRelevance(jobMatchingRole.title, jobMatchingRole.description, jeanProfile);
assert.strictEqual(relMatchRole.isRelevant, true);
assert.ok(relMatchRole.matchedRole);
console.log('  ✓ Offre alignée avec rôle cible (Senior Account Executive) : éligible');

const jobMatchingSkill = {
  title: 'Commercial Grands Comptes',
  company: 'Software Enterprise',
  canton: 'VD',
  description: 'Expérience requise sur Salesforce, solutions SaaS et vente B2B complexe.'
};
const relMatchSkill = checkJobRelevance(jobMatchingSkill.title, jobMatchingSkill.description, jeanProfile);
assert.strictEqual(relMatchSkill.isRelevant, true);
assert.ok(relMatchSkill.matchedSkills.length >= 2);
console.log('  ✓ Offre sans titre identique mais avec compétences clés (Salesforce, SaaS, B2B) : éligible');

// B. Offre sans lien avec le profil : désactivé par défaut, activé sur option du profil
const jobCook = {
  title: 'Cuisinier·ère en diététique',
  company: 'Clinique de la Source',
  canton: 'VD',
  description: 'Préparation des repas diététiques, gestion de la cuisine chaude et respect des normes HACCP.'
};
const relCook = checkJobRelevance(jobCook.title, jobCook.description, jeanProfile);
assert.strictEqual(relCook.isRelevant, false);
assert.strictEqual(relCook.level, 'none');
assert.ok(relCook.reason?.includes('aucun intitulé de métier ou compétence en commun'));

// B.1 Par défaut (option non activée) : l'offre n'est PAS exclue (recherche large préservée)
const evalCookDefault = evaluateJobFilters(jobCook, jeanProfile);
assert.strictEqual(evalCookDefault.isExcluded, false, 'Par défaut, pertinence désactivée -> offre conservée');
console.log('  ✓ Par défaut : filtre de pertinence désactivé, l’offre est conservée');

// B.2 Avec enable_relevance_matching = true : l'offre est exclue avec motif
const jeanProfileStrict = { ...jeanProfile, enable_relevance_matching: true };
const evalCookStrict = evaluateJobFilters(jobCook, jeanProfileStrict);
assert.strictEqual(evalCookStrict.isExcluded, true, 'Avec option activée, Cuisinier doit être exclu');
assert.ok(evalCookStrict.matchedExclusions.includes('relevance:no_profile_match'));
assert.ok(evalCookStrict.reasons.some(r => r.includes('aucun intitulé de métier')));
console.log('  ✓ Avec option activée : « Cuisinier·ère en diététique » strictement exclue avec motif explicite');

// C. Autre offre non pertinente avec option activée : Infirmier
const jobNurse = {
  title: 'Infirmier / Infirmière diplômé(e)',
  company: 'HUG',
  canton: 'GE',
  description: 'Soins aux patients, administration des traitements médicaux, travail en équipe pluridisciplinaire.'
};
const evalNurse = evaluateJobFilters(jobNurse, jeanProfileStrict);
assert.strictEqual(evalNurse.isExcluded, true, 'Infirmier doit être exclu avec option activée');
assert.ok(evalNurse.matchedExclusions.includes('relevance:no_profile_match'));
console.log('  ✓ Offre non pertinente (« Infirmier ») : exclue quand matching actif');

// D. Profil vide : pas d’exclusion automatique (recherche large)
const emptyProfile = {};
const relEmpty = checkJobRelevance(jobCook.title, jobCook.description, emptyProfile);
assert.strictEqual(relEmpty.isRelevant, true, 'Profil vide ne doit pas auto-exclure');
console.log('  ✓ Profil sans critères : conservation des offres (recherche large préservée)');

// ─────────────────────────────────────────────────────────────────────────────
// 5. TESTS DÉDOUBLONNAGE NOMS D’ENTREPRISES
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 5. Tests Dédoublonnage Noms d’Entreprises ---');

assert.strictEqual(cleanCompanyName('Canon EMEA Canon EMEA'), 'Canon EMEA');
assert.strictEqual(cleanCompanyName('Randstad Switzerland Randstad Switzerland'), 'Randstad Switzerland');
assert.strictEqual(cleanCompanyName('Salesforce Salesforce'), 'Salesforce');
assert.strictEqual(cleanCompanyName('Google Switzerland'), 'Google Switzerland');
assert.strictEqual(cleanCompanyName(''), 'Entreprise en Suisse');
assert.strictEqual(cleanCompanyName(null), 'Entreprise en Suisse');
console.log('  ✓ Dédoublonnage des noms d’entreprises : "Canon EMEA Canon EMEA" -> "Canon EMEA" validé');

// ─────────────────────────────────────────────────────────────────────────────
// 6. TESTS NETTOYAGE TITRE POUR EXCLUSION (Point 1 Feature Croix)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 6. Tests Nettoyage Titre pour Exclusion (cleanJobTitleForExclusion) ---');

assert.strictEqual(
  cleanJobTitleForExclusion('Vendeur / vendeuse en boulangerie 80-100% (h/f/d)'),
  'Vendeur / vendeuse en boulangerie'
);
assert.strictEqual(
  cleanJobTitleForExclusion('Cuisinier·ère en diététique 100% (f/h)'),
  'Cuisinier en diététique'
);
assert.strictEqual(
  cleanJobTitleForExclusion('Account Executive (H/F) - CDI 100%'),
  'Account Executive'
);
assert.strictEqual(
  cleanJobTitleForExclusion('Technicien de maintenance (m/w/d) 80 - 100%'),
  'Technicien de maintenance'
);
assert.strictEqual(
  cleanJobTitleForExclusion(''),
  ''
);
console.log('  ✓ cleanJobTitleForExclusion nettoie le genre, les pourcentages et les mentions de contrat');

// ─────────────────────────────────────────────────────────────────────────────
// 7. TESTS RACCOURCI DISTINCTIF & CONFLITS PROFILS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- 7. Tests Raccourci Distinctif & Conflits Profil ---');
assert.strictEqual(
  getDistinctiveShortcut('Vendeur / vendeuse en boulangerie 80-100% (h/f/d)'),
  'vendeur boulangerie'
);
assert.strictEqual(
  getDistinctiveShortcut('Cuisinier·ère en diététique 100% (f/h)'),
  'cuisinier dietetique'
);

const conflictCheck = checkRoleConflict('account executive', { current_title: 'Senior Account Executive' });
assert.strictEqual(conflictCheck.hasConflict, true);
console.log('  ✓ getDistinctiveShortcut et checkRoleConflict validés dans les tests unitaires');

console.log('\n========================================================================');
console.log('SUCCÈS : TOUTES LES VALIDATIONS DU MOTEUR SONT RÉUSSIES !');
console.log('========================================================================\n');
