/**
 * Job title exclusion matching logic for JobPilot.
 *
 * Rules:
 * - Matching is performed ONLY on the job title (never description, company, canton, or score).
 * - Case-insensitive and accent-insensitive.
 * - Handles separators (slashes, hyphens, parentheses, %, etc.).
 * - Multi-word expressions: all significant words in the exclusion rule must be matched in the title tokens.
 * - French morphology: handles masculine/feminine forms (e.g., vendeur / vendeuse) and plurals (e.g., comptable / comptables).
 * - Empty exclusion list or empty rules do not mask anything.
 */

// French connector words that can be ignored in multi-word expressions if longer keywords exist
const FRENCH_CONNECTORS = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'en', 'au', 'aux',
  'a', 'et', 'ou', 'pour', 'par', 'dans', 'sur', 'avec', 'sans', 'sous',
  'd', 'l', 'hf', 'fh', 'h', 'f'
]);

/**
 * Normalizes text: lowercase, decomposes and strips diacritics/accents.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Tokenizes text into individual normalized alphanumeric words.
 * Splits on punctuation, slashes, dashes, percentages, and whitespace.
 */
export function tokenizeFrench(text: string): string[] {
  const norm = normalizeText(text);
  // Split on any sequence of non-alphanumeric characters
  const rawTokens = norm.split(/[^a-z0-9]+/);
  return rawTokens.filter((t) => t.length > 0);
}

/**
 * Computes a simplified French morphological root/stem for job titles,
 * harmonizing masculine/feminine variants and singular/plural forms.
 */
export function stemFrenchWord(rawWord: string): string {
  let w = normalizeText(rawWord).replace(/[^a-z0-9]/g, '');
  if (w.length <= 3) return w;

  // -trices / -trice / -teurs / -teur (e.g., animateur / animatrice -> animat)
  if (w.endsWith('trices')) return w.slice(0, -6) + 't';
  if (w.endsWith('teurs')) return w.slice(0, -5) + 't';
  if (w.endsWith('trice')) return w.slice(0, -5) + 't';
  if (w.endsWith('teur')) return w.slice(0, -4) + 't';

  // -euses / -euse / -eurs / -eur (e.g., vendeur / vendeuse -> vend)
  if (w.endsWith('euses')) return w.slice(0, -5);
  if (w.endsWith('eurs')) return w.slice(0, -4);
  if (w.endsWith('euse')) return w.slice(0, -4);
  if (w.endsWith('eur')) return w.slice(0, -3);

  // -ieres / -iere / -iers / -ier (e.g., infirmier / infirmiere -> infirm)
  if (w.endsWith('ieres')) return w.slice(0, -5);
  if (w.endsWith('iers')) return w.slice(0, -4);
  if (w.endsWith('iere')) return w.slice(0, -4);
  if (w.endsWith('ier')) return w.slice(0, -3);

  // -iennes / -ienne / -iens / -ien (e.g., technicien / technicienne -> technic)
  if (w.endsWith('iennes')) return w.slice(0, -6);
  if (w.endsWith('ienne')) return w.slice(0, -5);
  if (w.endsWith('iens')) return w.slice(0, -4);
  if (w.endsWith('ien')) return w.slice(0, -3);

  // -antes / -ante / -ants / -ant (e.g., assistant / assistante -> assist)
  if (w.endsWith('antes')) return w.slice(0, -5);
  if (w.endsWith('ants')) return w.slice(0, -4);
  if (w.endsWith('ante')) return w.slice(0, -4);
  if (w.endsWith('ant')) return w.slice(0, -3);

  // -entes / -ente / -ents / -ent
  if (w.endsWith('entes')) return w.slice(0, -5);
  if (w.endsWith('ents')) return w.slice(0, -4);
  if (w.endsWith('ente')) return w.slice(0, -4);
  if (w.endsWith('ent')) return w.slice(0, -3);

  // -eres / -ere / -ers / -er
  if (w.endsWith('eres')) return w.slice(0, -4);
  if (w.endsWith('ers')) return w.slice(0, -3);
  if (w.endsWith('ere')) return w.slice(0, -3);
  if (w.endsWith('er')) return w.slice(0, -2);

  // -aux / -al / -ale / -ales (general French rule: -al -> plur. -aux / fém. -ale, -ales)
  if (w.endsWith('ales')) return w.slice(0, -4) + 'al';
  if (w.endsWith('aux')) return w.slice(0, -3) + 'al';
  if (w.endsWith('ale')) return w.slice(0, -3) + 'al';

  // -istes / -iste
  if (w.endsWith('istes')) return w.slice(0, -1);

  // Plural -s (e.g., comptables -> comptable)
  if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);

  return w;
}

/**
 * Checks whether an exclusion keyword matches a single token from the title.
 * Handles exact matches, simple feminine -e addition, and morphological stem variants.
 */
function wordMatches(patternWord: string, titleWord: string): boolean {
  if (patternWord === titleWord) return true;
  // Simple regular feminine addition (e.g., avocat / avocate, apprenti / apprentie)
  if (patternWord + 'e' === titleWord || titleWord + 'e' === patternWord) return true;

  const pStem = stemFrenchWord(patternWord);
  const tStem = stemFrenchWord(titleWord);
  return pStem.length >= 3 && pStem === tStem;
}

/**
 * Checks whether a single exclusion pattern matches a job title.
 * The exclusion matches if and only if EVERY word of the pattern matches
 * at least one word in the job title.
 */
export function matchesExclusion(jobTitle: string, exclusionPattern: string): boolean {
  if (!jobTitle || !exclusionPattern) return false;

  const rawPatternTokens = tokenizeFrench(exclusionPattern);
  if (rawPatternTokens.length === 0) return false;

  // Filter out minor connectors unless all words are connectors
  const filteredPatternTokens = rawPatternTokens.filter((t) => !FRENCH_CONNECTORS.has(t));
  const patternTokens = filteredPatternTokens.length > 0 ? filteredPatternTokens : rawPatternTokens;

  const titleTokens = tokenizeFrench(jobTitle);
  if (titleTokens.length === 0) return false;

  // Every pattern token must match at least one token in the job title
  return patternTokens.every((pToken) =>
    titleTokens.some((tToken) => wordMatches(pToken, tToken))
  );
}

export interface ExclusionCheckResult {
  isExcluded: boolean;
  matchedPattern?: string;
  matchedPatterns: string[];
  reason?: string;
}

/**
 * Evaluates a job title against a list of excluded role patterns.
 * Returns whether it is excluded, all matching rules, and a combined human-readable reason.
 */
export function checkJobExclusions(
  jobTitle: string,
  excludedRoles?: string[] | null
): ExclusionCheckResult {
  if (!jobTitle || !Array.isArray(excludedRoles) || excludedRoles.length === 0) {
    return { isExcluded: false, matchedPatterns: [] };
  }

  const matchedPatterns: string[] = [];
  for (const rawPattern of excludedRoles) {
    if (typeof rawPattern !== 'string') continue;
    const trimmed = rawPattern.trim();
    if (!trimmed) continue;

    if (matchesExclusion(jobTitle, trimmed)) {
      matchedPatterns.push(trimmed);
    }
  }

  if (matchedPatterns.length > 0) {
    const reason =
      matchedPatterns.length === 1
        ? `Exclu par la règle : « ${matchedPatterns[0]} »`
        : `Exclu par ${matchedPatterns.length} règles : ${matchedPatterns.map((p) => `« ${p} »`).join(', ')}`;

    return {
      isExcluded: true,
      matchedPattern: matchedPatterns[0],
      matchedPatterns,
      reason
    };
  }

  return { isExcluded: false, matchedPatterns: [] };
}

/**
 * Nettoie un intitulé de poste pour préremplir une règle d'exclusion de métier.
 * Retire les mentions de genre (ex: (h/f/d), f/h, m/w), les pourcentages / taux (80-100%, 100%),
 * les mentions de temps de travail (temps plein, temps partiel) et la ponctuation parasite.
 */
export function cleanJobTitleForExclusion(title: string): string {
  if (!title) return '';
  let str = title;

  // 1. Mentions de genre / inclusion : (h/f/d), (f/h/d), (m/w/d), (h/f), (f/h), h/f, f/h, m/w, etc.
  str = str.replace(/[·•\.\-](?:ère|ere|e|ne|se|trice|euse)\b/gi, '');
  str = str.replace(/[\(\[]\s*(?:h\/f\/d|f\/h\/d|m\/w\/d|w\/m\/d|h\/f\/x|f\/h\/x|d\/m\/w|h\/f|f\/h|m\/w|w\/m|m\/f|f\/m|all genders|tous genres)\s*[\)\]]/gi, ' ');
  str = str.replace(/\b(?:h\/f\/d|f\/h\/d|m\/w\/d|w\/m\/d|h\/f\/x|f\/h\/x|d\/m\/w|h\/f|f\/h|m\/w|w\/m|m\/f|f\/m)\b/gi, ' ');

  // 2. Taux et pourcentages de travail : 80-100%, 80 à 100%, 100%, etc.
  str = str.replace(/\b\d{1,3}\s*[-–—àa]\s*\d{1,3}\s*%?/g, ' ');
  str = str.replace(/\b\d{1,3}\s*%/g, ' ');
  str = str.replace(/\b(?:100%|80%|50%|temps plein|temps complet|temps partiel|plein temps|partiel|teilzeit|vollzeit)\b/gi, ' ');

  // 3. Mentions contractuelles usuelles en fin d'intitulé
  str = str.replace(/[\(\[]\s*(?:cdi|cdd|stage|fixe|temporaire|interim|remote|full remote|télétravail)\s*[\)\]]/gi, ' ');
  str = str.replace(/\s*[-–—|]\s*(?:cdi|cdd|stage|fixe|temporaire|interim|remote)\s*$/gi, ' ');

  // 4. Nettoyage ponctuation résiduelle et espaces superflus
  str = str.replace(/[()[\]{}]/g, ' ');
  str = str.replace(/\s+/g, ' ').trim();
  str = str.replace(/^[-–—/\\:,;|.]+|[-–—/\\:,;|.]+$/g, '').trim();

  return str;
}

/**
 * Extrait les deux mots les plus distinctifs et représentatifs d'un intitulé de poste
 * pour suggérer un raccourci d'exclusion propre (ex: "vendeur boulangerie").
 */
export function getDistinctiveShortcut(title: string): string {
  const cleaned = cleanJobTitleForExclusion(title);
  if (!cleaned) return '';

  const stopWords = new Set([
    'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'en', 'au', 'aux',
    'a', 'et', 'ou', 'pour', 'par', 'dans', 'sur', 'avec', 'sans', 'sous',
    'd', 'l', 'hf', 'fh', 'h', 'f', 'hfd', 'fhd', 'mwd', 'wmd',
    'cdi', 'cdd', 'stage', 'temps', 'plein', 'partiel', 'suisse'
  ]);

  const words = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));

  if (words.length === 0) return cleaned;

  // Dédoublonnage morphologique des variantes de genre consécutives (ex: vendeur / vendeuse)
  const uniqueWords: string[] = [];
  for (const w of words) {
    const stem = stemFrenchWord(w);
    if (!uniqueWords.some(uw => stemFrenchWord(uw) === stem)) {
      uniqueWords.push(w);
    }
  }

  return uniqueWords.slice(0, 2).join(' ');
}

/**
 * Vérifie si une règle d'exclusion recoupe le poste actuel ou les postes recherchés du profil.
 */
export function checkRoleConflict(
  ruleText: string,
  profile?: { wanted_roles?: string[]; current_title?: string }
): { hasConflict: boolean; conflictedWith?: string } {
  if (!ruleText || !profile) return { hasConflict: false };
  const trimmed = ruleText.trim();
  if (!trimmed) return { hasConflict: false };

  // 1. Vérification avec le poste actuel
  if (profile.current_title && matchesExclusion(profile.current_title, trimmed)) {
    return { hasConflict: true, conflictedWith: `votre poste actuel (« ${profile.current_title} »)` };
  }

  // 2. Vérification avec les postes recherchés
  if (Array.isArray(profile.wanted_roles)) {
    for (const role of profile.wanted_roles) {
      if (role && matchesExclusion(role, trimmed)) {
        return { hasConflict: true, conflictedWith: `votre poste ciblé (« ${role} »)` };
      }
    }
  }

  return { hasConflict: false };
}
