/**
 * Moteur de filtrage et d'exclusion JobPilot Suisse.
 * 
 * Philosophie : Chercher large, puis écarter ce qu'on ne veut pas.
 * Pas de bonus/malus confus : chaque offre est soit retenue, soit exclue avec son motif explicite.
 */
import { checkJobExclusions } from './exclusionMatcher.ts';

export interface FilterResult {
  isExcluded: boolean;
  reasons: string[];
  primaryReason?: string;
  isCantonUnknown: boolean;
  matchedExclusions: string[];
  relevance?: {
    isRelevant: boolean;
    level: 'high' | 'medium' | 'none';
    matchedRole?: string;
    matchedSkills: string[];
    reason?: string;
  };
}

export interface FilterProfileCriteria {
  wanted_cantons?: string[];
  excluded_cantons?: string[];
  salary_min?: string | number;
  workload?: string | number;
  remote_accepted?: boolean;
  excluded_roles?: string[];
  negative_keywords?: string[];
  avoided_companies?: string[];
  // Option d'activation du matching métier (désactivé par défaut)
  enable_relevance_matching?: boolean;
  // Critères de pertinence et matching profil
  current_title?: string;
  wanted_roles?: string[];
  skills?: string[];
  positive_keywords?: string[];
  experiences?: Array<{ title?: string; company?: string; realizations?: string[]; description?: string }>;
}

export const SWISS_CANTONS = new Set([
  'AG', 'AI', 'AR', 'BE', 'BL', 'BS', 'FR', 'GE', 'GL', 'GR',
  'JU', 'LU', 'NE', 'NW', 'OW', 'SG', 'SH', 'SO', 'SZ', 'TG',
  'TI', 'UR', 'VD', 'VS', 'ZG', 'ZH'
]);

/**
 * Extrait strictement le taux d'occupation depuis le champ dédié (ex: "80-100%", "100%", "80 %", "100 %", "80 à 100%").
 * N'analyse JAMAIS la description globale ou le titre pour éviter d'interpréter des années d'expérience ou des métriques.
 * Renvoie [min, max] ou null si aucun taux valide n'est présent.
 */
export function parseWorkloadRange(raw?: string | null): [number, number] | null {
  if (!raw || typeof raw !== 'string') return null;
  const str = raw.trim().toLowerCase();
  if (!str) return null;

  // Reconnaissance explicite de "temps plein" ou "temps complet"
  if (/^temps\s+(?:plein|complet)$/i.test(str) || /^vollzeit$/i.test(str) || /^full-?time$/i.test(str)) {
    return [100, 100];
  }

  // Reconnaissance explicite de "temps partiel" ou "teilzeit"
  if (/^temps\s+partiel$/i.test(str) || /^teilzeit$/i.test(str) || /^part-?time$/i.test(str)) {
    return [50, 80];
  }

  // Motif strict avec symbole pourcentage obligatoire ou suffixe pct
  // Ex: "80-100%", "80–100 %", "80 à 100 %", "100%", "80 / 100 %", "80%"
  const rangeMatch = str.match(/(\d{2,3})\s*(?:-|–|—|à|to|\/)\s*(\d{2,3})\s*(?:%|pct|pourcent)/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (a >= 10 && a <= 100 && b >= 10 && b <= 100) {
      return [Math.min(a, b), Math.max(a, b)];
    }
  }

  const singleMatch = str.match(/(\d{2,3})\s*(?:%|pct|pourcent)/i);
  if (singleMatch) {
    const val = Number(singleMatch[1]);
    if (val >= 10 && val <= 100) {
      return [val, val];
    }
  }

  return null;
}

/**
 * Parse un nombre avec séparateurs suisses ou 'k' :
 * "120000" -> 120000
 * "120'000" -> 120000
 * "120 000" -> 120000
 * "120k" / "120K" -> 120000
 * "120.-" / "120'000.-" -> 120000
 */
function parseSwissAmount(str: string): number | null {
  if (!str) return null;
  const cleaned = str.trim().toLowerCase()
    .replace(/\b(?:chf|francs|fr\.?)\b/gi, '')
    .replace(/(?:\/|\bpar|\bpro|\bper)\s*(?:mois|monat|month|an|jahr|annum)\b/gi, '')
    .trim();

  // Format "120k" / "120.5k"
  const kMatch = cleaned.match(/^([0-9]+(?:[.,][0-9]+)?)\s*k$/i);
  if (kMatch) {
    const base = parseFloat(kMatch[1].replace(',', '.'));
    if (!isNaN(base)) return Math.round(base * 1000);
  }

  // Format avec séparateur millier : 120'000, 120 000, 120000, éventuellement terminé par .-, .--, - ou tiret cadratin .–
  const hasDashCents = /\s*\.?(?:--?|–|—)$/.test(cleaned);
  const numCleaned = cleaned
    .replace(/\s*\.?(?:--?|–|—)$/, '') // retire .-, .--, -, .–, .—
    .replace(/['’\s]/g, '');

  const num = Number(numCleaned);
  if (!isNaN(num) && num > 0) {
    // Si format abrégé en milliers de francs suisses ex: "120.-" dans un contexte de salaire annuel
    if (num >= 50 && num <= 500 && hasDashCents) {
      return num * 1000;
    }
    return num;
  }
  return null;
}

/**
 * Extrait un montant de salaire annuel suisse (CHF) fiable.
 * 
 * Règles :
 * 1. Formats acceptés : 120000, 120'000, 120 000, 120k, 120K, 120.-, CHF 120'000.–, 120'000 CHF, 120k CHF, 120 000.-.
 * 2. Distinction mensuel / annuel : si suivi de "par mois", "/mois", "mensuel", "monthly", conversion documentée x 12.
 * 3. Fourchette : utilise explicitement la borne inférieure pour la comparaison au seuil minimum.
 * 4. Contexte obligatoire : un montant isolé dans une date ou une référence ("Réf: 120000", "Année 2026") est rejeté.
 * 5. Si aucun salaire fiable détecté : renvoie null (l'offre sera conservée).
 */
export function extractAnnualSalary(salaryField?: any, text?: string): number | null {
  // A. Champ explicite numérique dédié
  if (typeof salaryField === 'number' && salaryField >= 20000 && salaryField <= 1000000) {
    return salaryField;
  }

  // B. Champ explicite textuel dédié (ex: job.salary = "120'000 CHF", "120k", "8000 CHF / mois")
  const rawFieldStr = typeof salaryField === 'string' ? salaryField.trim() : '';
  if (rawFieldStr) {
    const isMonthly = /(?:par\s+mois|\/\s*mois|\/\s*month|mensuel|mensuelle|monthly|pro\s+monat)\b/i.test(rawFieldStr);
    const rangeMatch = rawFieldStr.match(/([0-9]{1,3}(?:['’\s][0-9]{3})+|[0-9]{1,3}\s*k|[0-9]{4,6}|[0-9]{2,3}\s*\.-)\s*(?:-|–|—|à|to)\s*([0-9]{1,3}(?:['’\s][0-9]{3})+|[0-9]{1,3}\s*k|[0-9]{4,6}|[0-9]{2,3}\s*\.-)/i);
    if (rangeMatch) {
      const lower = parseSwissAmount(rangeMatch[1]);
      if (lower && lower >= 3000) {
        const annual = isMonthly ? lower * 12 : lower;
        if (annual >= 30000 && annual <= 1000000) return annual;
      }
    }
    const directAmount = parseSwissAmount(rawFieldStr);
    if (directAmount && directAmount >= 3000) {
      const annual = isMonthly ? directAmount * 12 : directAmount;
      if (annual >= 30000 && annual <= 1000000) return annual;
    }
  }

  // C. Recherche dans le texte libre (titre + description)
  // Exigence stricte du blueprint : Un simple "CHF" NE SUFFIT PAS.
  // Un contexte explicite (« salaire », « rémunération », « salary », « Gehalt », « par an », « par mois »)
  // doit être présent dans la fenêtre immédiate du montant.
  if (!text || typeof text !== 'string') return null;

  const numPattern = `(?:[0-9]{1,3}(?:['’\\s][0-9]{3})+|[0-9]{1,3}\\s*k|[0-9]{4,6}|[0-9]{2,3}\\s*\\.-)`;
  const salaryContextBeforeRegex = /(?:salaire|rémunération|remuneration|salary|salär|salaer|gehalt|lohn|löhn)\b/i;
  const salaryContextAfterRegex = /(?:par\s+an|pro\s+jahr|per\s+annum|p\.a\.|par\s+mois|pro\s+monat|mensuel|mensuelle|monthly)\b/i;
  const nonSalaryContextRegex = /(?:budget|chiffre\s+d['’]affaires|c\.a\.|ca\b|coût|investissement|chiffre)/i;

  // 1. Recherche prioritaire de fourchette salariale dans le texte
  const rangeRegex = new RegExp(`\\b(${numPattern})\\s*(?:-|–|—|à|to)\\s*(${numPattern})`, 'gi');
  let rangeMatch: RegExpExecArray | null;
  while ((rangeMatch = rangeRegex.exec(text)) !== null) {
    const idx = rangeMatch.index;
    const len = rangeMatch[0].length;
    const before = text.slice(Math.max(0, idx - 50), idx);
    const after = text.slice(idx + len, Math.min(text.length, idx + len + 40));

    if (nonSalaryContextRegex.test(before)) continue;

    const hasSalaryContext = salaryContextBeforeRegex.test(before) || salaryContextAfterRegex.test(after);
    if (!hasSalaryContext) continue;

    const isMonthly = /(?:par\s+mois|\/\s*mois|\/\s*month|mensuel|mensuelle|monthly|pro\s+monat)\b/i.test(`${before} ${after}`);
    const lower = parseSwissAmount(rangeMatch[1]);
    if (lower && lower >= 3000) {
      const annualAmount = isMonthly ? lower * 12 : lower;
      if (annualAmount >= 30000 && annualAmount <= 1000000) {
        return annualAmount;
      }
    }
  }

  // 2. Recherche de montant unique avec contexte salarial strict
  const singleRegex = new RegExp(`\\b(${numPattern})`, 'gi');
  let singleMatch: RegExpExecArray | null;
  while ((singleMatch = singleRegex.exec(text)) !== null) {
    const idx = singleMatch.index;
    const len = singleMatch[0].length;
    const before = text.slice(Math.max(0, idx - 50), idx);
    const after = text.slice(idx + len, Math.min(text.length, idx + len + 40));

    if (nonSalaryContextRegex.test(before)) continue;

    const hasSalaryContext = salaryContextBeforeRegex.test(before) || salaryContextAfterRegex.test(after);
    if (!hasSalaryContext) continue;

    const isMonthly = /(?:par\s+mois|\/\s*mois|\/\s*month|mensuel|mensuelle|monthly|pro\s+monat)\b/i.test(`${before} ${after}`);
    const amount = parseSwissAmount(singleMatch[1]);
    if (amount && amount >= 3000) {
      const annualAmount = isMonthly ? amount * 12 : amount;
      if (annualAmount >= 30000 && annualAmount <= 1000000) {
        return annualAmount;
      }
    }
  }

  return null;
}

const COMMON_FRENCH_STOPWORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'en', 'et', 'au', 'aux',
  'pour', 'avec', 'dans', 'sur', 'par', 'the', 'and', 'for', 'with', 'in', 'on', 'at'
]);

function normalizeRelevanceText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Contrôle de pertinence métier basé sur les informations réelles du profil candidat.
 * - Critères obligatoires : correspondance d'un titre de rôle (actuel, visé ou passé)
 *   OU correspondance d'au moins une compétence / mot-clé positif dans l'offre.
 * - Critères optionnels : calcul du niveau de pertinence (high / medium / none).
 * - Une offre sans AUCUN lien avec le profil (ex: cuisinier pour un profil commercial SaaS) est exclue.
 */
export function checkJobRelevance(
  title: string,
  desc: string,
  profile?: FilterProfileCriteria
): { isRelevant: boolean; level: 'high' | 'medium' | 'none'; matchedRole?: string; matchedSkills: string[]; reason?: string } {
  if (!profile) {
    return { isRelevant: true, level: 'medium', matchedSkills: [] };
  }

  // 1. Collecte des rôles cibles et passés du candidat
  const roleStrings: string[] = [];
  if (profile.current_title) roleStrings.push(profile.current_title);
  if (Array.isArray(profile.wanted_roles)) roleStrings.push(...profile.wanted_roles);
  if (Array.isArray(profile.experiences)) {
    for (const exp of profile.experiences) {
      if (exp.title) roleStrings.push(exp.title);
    }
  }

  // 2. Collecte des compétences et mots-clés positifs
  const skillStrings: string[] = [];
  if (Array.isArray(profile.skills)) skillStrings.push(...profile.skills);
  if (Array.isArray(profile.positive_keywords)) skillStrings.push(...profile.positive_keywords);

  // Si le profil candidat n'a encore renseigné aucun titre ni compétence : pas d'exclusion pour chercher large
  if (roleStrings.length === 0 && skillStrings.length === 0) {
    return { isRelevant: true, level: 'medium', matchedSkills: [] };
  }

  const normTitle = normalizeRelevanceText(title);
  const normDesc = normalizeRelevanceText(desc);

  // Vérification de correspondance rôle / métier (dans le titre en priorité)
  let matchedRole: string | undefined = undefined;
  for (const rawRole of roleStrings) {
    const normRole = normalizeRelevanceText(rawRole);
    if (!normRole || normRole.length < 3) continue;

    if (normTitle.includes(normRole)) {
      matchedRole = rawRole;
      break;
    }

    const roleTokens = normRole.split(' ').filter(t => t.length >= 4 && !COMMON_FRENCH_STOPWORDS.has(t));
    const titleTokens = new Set(normTitle.split(' '));
    const matchingTokens = roleTokens.filter(t => titleTokens.has(t));

    if (matchingTokens.length >= 1) {
      matchedRole = rawRole;
      break;
    }
  }

  // Vérification de compétences clés (dans titre ou description)
  const matchedSkills: string[] = [];
  for (const rawSkill of skillStrings) {
    const normSkill = normalizeRelevanceText(rawSkill);
    if (!normSkill || normSkill.length < 3 || COMMON_FRENCH_STOPWORDS.has(normSkill)) continue;

    const escaped = normSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(normTitle) || regex.test(normDesc)) {
      matchedSkills.push(rawSkill);
    }
  }

  const hasRoleMatch = Boolean(matchedRole);
  const hasSkillMatch = matchedSkills.length > 0;

  if (hasRoleMatch && hasSkillMatch) {
    return { isRelevant: true, level: 'high', matchedRole, matchedSkills };
  }

  if (hasRoleMatch || hasSkillMatch) {
    return { isRelevant: true, level: 'medium', matchedRole, matchedSkills };
  }

  return {
    isRelevant: false,
    level: 'none',
    matchedSkills: [],
    reason: `Offre sans lien de pertinence avec votre profil (aucun intitulé de métier ou compétence en commun)`
  };
}

/**
 * Évalue une offre d'emploi par rapport aux critères et exclusions du profil candidat.
 */
export function evaluateJobFilters(job: any, profile?: FilterProfileCriteria): FilterResult {
  const reasons: string[] = [];
  const matchedExclusions: string[] = [];
  let isCantonUnknown = false;

  const title = String(job?.title || '');
  const desc = String(job?.description || '');
  const company = String(job?.company || '').trim();
  const rawCanton = String(job?.canton || '').trim().toUpperCase();

  // 1. Détection canton : vérifie s'il fait partie des 26 cantons suisses officiels
  const isRecognizedCanton = SWISS_CANTONS.has(rawCanton);
  if (!rawCanton || !isRecognizedCanton) {
    isCantonUnknown = true;
  }

  if (profile) {
    // 2. Cantons autorisés
    // Règle blueprint :
    // - wanted_cantons vide ou absent : AUCUNE restriction géographique (aucun fallback GE/VD en dur).
    // - wanted_cantons renseigné : ne conserver que les offres dont le canton est explicitement reconnu et autorisé.
    // - Canton absent ou non reconnu : ne PAS exclure, mais marquer isCantonUnknown = true.
    const hasWantedCantons = Array.isArray(profile.wanted_cantons) && profile.wanted_cantons.length > 0;
    if (hasWantedCantons) {
      const wantedSet = new Set(profile.wanted_cantons!.map(c => String(c).trim().toUpperCase()));
      if (isRecognizedCanton) {
        if (!wantedSet.has(rawCanton)) {
          reasons.push(`Canton non retenu (${rawCanton}) — autorisés : ${Array.from(wantedSet).join(', ')}`);
          matchedExclusions.push(`canton:${rawCanton}`);
        }
      }
      // Note : si isCantonUnknown est vrai, on n'exclut pas l'offre, elle est conservée avec isCantonUnknown = true.
    }

    // 3. Cantons exclus expressément
    if (Array.isArray(profile.excluded_cantons) && profile.excluded_cantons.length > 0) {
      const excludedSet = new Set(profile.excluded_cantons.map(c => String(c).trim().toUpperCase()));
      if (isRecognizedCanton && excludedSet.has(rawCanton)) {
        reasons.push(`Canton exclu expressément : ${rawCanton}`);
        matchedExclusions.push(`excluded_canton:${rawCanton}`);
      }
    }

    // 4. Salaire annuel minimum
    // Règle blueprint :
    // - Champ vide : aucune restriction.
    // - Salaire annoncé inférieur au seuil : exclusion avec motif explicite.
    // - Salaire absent de l'offre : conserver l'offre.
    const minSalaryThreshold = Number(profile.salary_min) || 0;
    if (minSalaryThreshold > 0) {
      const detectedSalary = extractAnnualSalary(job.salary, `${title} ${desc}`);
      if (detectedSalary !== null && detectedSalary < minSalaryThreshold) {
        reasons.push(`Salaire annoncé (${detectedSalary.toLocaleString('fr-CH')} CHF) inférieur au minimum souhaité (${minSalaryThreshold.toLocaleString('fr-CH')} CHF)`);
        matchedExclusions.push(`salary_min:${minSalaryThreshold}`);
      }
    }

    // 5. Taux d'occupation maximum
    // Règle blueprint :
    // - job.workload vide : NE PAS parser le texte, conserver l'offre.
    // - Vide ou 100% : aucune restriction.
    // - À 90% : conserver les offres permettant de travailler à 90% ou moins (80–100% acceptée, 100% strict exclue).
    // - Taux absent : conserver l'offre.
    const rawWorkloadSetting = String(profile.workload || '').replace(/[^0-9]/g, '');
    const maxAllowedWorkload = rawWorkloadSetting ? Number(rawWorkloadSetting) : 100;

    if (maxAllowedWorkload > 0 && maxAllowedWorkload < 100) {
      if (job.workload && typeof job.workload === 'string' && job.workload.trim() !== '') {
        const jobRange = parseWorkloadRange(job.workload);
        if (jobRange) {
          // Si la borne minimale est strictement supérieure au maximum souhaité (ex: 100% > 90%)
          if (jobRange[0] > maxAllowedWorkload) {
            const formattedRange = jobRange[0] === jobRange[1] ? `${jobRange[0]}%` : `${jobRange[0]}–${jobRange[1]}%`;
            reasons.push(`Taux d'occupation requis (${formattedRange}) supérieur au maximum souhaité (${maxAllowedWorkload}%)`);
            matchedExclusions.push(`workload_max:${maxAllowedWorkload}`);
          }
        }
      }
      // Si job.workload est vide ou absent, l'offre est conservée.
    }

    // 6. Postes et métiers exclus (appliqué strictement au titre de l'annonce avec lemmatisation)
    const excludedRoles = Array.isArray(profile.excluded_roles) ? profile.excluded_roles : [];
    if (excludedRoles.length > 0) {
      const roleMatch = checkJobExclusions(title, excludedRoles);
      if (roleMatch.isExcluded) {
        reasons.push(roleMatch.reason || 'Poste correspondant à un métier exclu');
        matchedExclusions.push(...roleMatch.matchedPatterns);
      }
    }

    // 7. Mots ou expressions exclus (appliqué au titre ET à la description)
    const negativeKeywords = Array.isArray(profile.negative_keywords) ? profile.negative_keywords : [];
    const fullTextLower = `${title} ${desc}`.toLowerCase();
    for (const rawKw of negativeKeywords) {
      const kw = String(rawKw || '').trim().toLowerCase();
      if (!kw) continue;
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(fullTextLower)) {
        reasons.push(`Contient le terme exclu : « ${rawKw} »`);
        matchedExclusions.push(`keyword:${kw}`);
      }
    }

    // 8. Entreprises évitées
    const avoidedCompanies = Array.isArray(profile.avoided_companies) ? profile.avoided_companies : [];
    const companyLower = company.toLowerCase();
    for (const rawCompany of avoidedCompanies) {
      const avoided = String(rawCompany || '').trim().toLowerCase();
      if (avoided && companyLower.includes(avoided)) {
        reasons.push(`Entreprise exclue : « ${rawCompany} »`);
        matchedExclusions.push(`company:${avoided}`);
      }
    }

    // 9. Contrôle de pertinence métier (Matching profil - désactivé par défaut, activable via option profil)
    const relevance = checkJobRelevance(title, desc, profile);
    if (profile.enable_relevance_matching === true && !relevance.isRelevant) {
      reasons.push(relevance.reason || "Offre sans lien de pertinence avec votre profil (aucun intitulé de métier ou compétence en commun)");
      matchedExclusions.push("relevance:no_profile_match");
    }
  }

  const isExcluded = reasons.length > 0;
  const relevanceResult = profile ? checkJobRelevance(title, desc, profile) : undefined;

  return {
    isExcluded,
    reasons,
    primaryReason: reasons[0],
    isCantonUnknown,
    matchedExclusions,
    relevance: relevanceResult,
  };
}
