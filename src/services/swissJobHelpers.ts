// Swiss Job Helpers: Canton detection, workload extraction, HTML sanitizer, scoring, search queries

export function detectSwissCanton(locationStr: string, text: string): string {
  const combined = ((locationStr || '') + ' ' + (text || '')).toUpperCase();
  const cantonMap: { [key: string]: string[] } = {
    'GE': ['GENÈVE', 'GENEVE', 'GENEVA', 'VERNIER', 'MEYRIN', 'LANCY', 'CAROUGE', 'PLAN-LES-OUATES', '1201', '1202', '1204', '1205', '1207', '1211'],
    'VD': ['VAUD', 'LAUSANNE', 'YVERDON', 'MONTREUX', 'NYON', 'VEVEY', 'MORGES', 'PUIDOUX', 'RENENS', 'GLAND', '1000', '1003', '1004', '1005', '1007', '1018'],
    'ZH': ['ZÜRICH', 'ZURICH', 'WINTERTHUR', 'USTER', 'DÜBENDORF', 'DIETIKON', '8001', '8002', '8005', '8050'],
    'BE': ['BERN', 'BERNE', 'BIEL', 'BIENNE', 'THUN', 'KÖNIZ', '3000', '3001', '3005'],
    'BS': ['BASEL', 'BÂLE', '4000', '4051', '4058'],
    'FR': ['FRIBOURG', 'FREIBURG', 'BULLE', 'VILLARS-SUR-GLÂNE', '1700'],
    'NE': ['NEUCHÂTEL', 'NEUCHATEL', 'LA CHAUX-DE-FONDS', 'LE LOCLE', '2000'],
    'VS': ['VALAIS', 'WALLIS', 'SION', 'SIERRE', 'MARTIGNY', 'MONTHEY', 'BRIG', '1950'],
    'TI': ['TICINO', 'TESSIN', 'LUGANO', 'BELLINZONA', 'LOCARNO', 'MENDRISIO', '6900'],
    'SG': ['ST. GALLEN', 'SAINT-GALL', 'RAPPERSWIL', '9000'],
    'LU': ['LUZERN', 'LUCERNE', 'EMMEN', 'KRIENS', '6000'],
    'SO': ['SOLOTHURN', 'SOLEURE', 'OLTEN', '4500'],
    'AG': ['AARGAU', 'ARGOVIE', 'AARAU', 'BADEN', 'WETTINGEN', '5000'],
    'JU': ['JURA', 'DELÉMONT', 'DELEMONT', 'PORRENTRUY', '2800']
  };

  for (const [code, keywords] of Object.entries(cantonMap)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) return code;
    }
  }
  return '';
}

export function detectWorkload(title: string, desc: string): string {
  const match = (title + ' ' + desc).match(/(\d{2,3})\s*%\s*-\s*(\d{2,3})\s*%/);
  if (match) return `${match[1]}% - ${match[2]}%`;
  const singleMatch = (title + ' ' + desc).match(/(\d{2,3})\s*%/);
  if (singleMatch) return `${singleMatch[1]}%`;
  return '';
}

/**
 * Nettoie et dédoublonne les noms d'entreprises issus du scraping.
 * Corrige les concaténations répétées (ex: "Canon EMEA Canon EMEA" -> "Canon EMEA").
 */
export function cleanCompanyName(raw?: string | null): string {
  if (!raw) return 'Entreprise en Suisse';
  let str = cleanHtmlText(String(raw)).replace(/\s+/g, ' ').trim();
  if (!str) return 'Entreprise en Suisse';

  // 1. Détection de répétition exacte par moitié de chaîne
  const len = str.length;
  for (let i = Math.floor(len / 2); i >= 2; i--) {
    const first = str.slice(0, i).trim();
    const second = str.slice(i).trim();
    if (first && first.toLowerCase() === second.toLowerCase()) {
      return first;
    }
  }

  // 2. Détection de répétition de tokens de mots : ["Canon", "EMEA", "Canon", "EMEA"]
  const words = str.split(' ');
  if (words.length >= 2 && words.length % 2 === 0) {
    const mid = words.length / 2;
    const firstHalf = words.slice(0, mid).join(' ');
    const secondHalf = words.slice(mid).join(' ');
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf;
    }
  }

  return str;
}

export function cleanHtmlText(text: string): string {
  if (!text) return '';
  let str = String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&bull;/gi, '•')
    .replace(/&hellip;/gi, '…')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');

  str = str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  str = str.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const lines = str.split('\n').map(line => line.replace(/[\t\f\v ]+/g, ' ').trim());
  const cleanedLines: string[] = [];
  let consecutiveEmpty = 0;
  for (const line of lines) {
    if (line === '') {
      consecutiveEmpty++;
      if (consecutiveEmpty <= 2) cleanedLines.push('');
    } else {
      consecutiveEmpty = 0;
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n').trim();
}

/**
 * Nettoie et purge les nœuds de bruit (scripts, styles, bannières cookies,
 * dialogues modaux, boutons de partage réseaux et signalements) d'un arbre DOM Cheerio.
 */
export function stripDomNoise($: any): void {
  if (!$) return;
  const noiseSelectors = [
    // Éléments hors contenu / scripts / styles
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'link', 'meta',
    // En-têtes, pieds de page, menus de navigation
    'header', 'footer', 'nav', 'aside',
    // Fenêtres modales, dialogues, popups
    '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
    // Bannières et SDK de consentement Cookies / RGPD (OneTrust, Didomi, Cookiebot, Usercentrics, Axeptio, etc.)
    '#onetrust-consent-sdk', '#onetrust-banner-sdk', '.onetrust-pc-dark-filter',
    '.didomi-popup-container', '#didomi-host', '#didomi-notice',
    '#CybotCookiebotDialog', '#CybotCookiebotDialogBody',
    '#cmpbox', '.cmpbox', '#usercentrics-root', 'div[id*="usercentrics"]',
    '[id*="cookie" i]', '[class*="cookie" i]',
    '[id*="consent" i]', '[class*="consent" i]',
    '[id*="gdpr" i]', '[class*="gdpr" i]',
    // Boutons et widgets de partage réseaux sociaux
    '[class*="share-" i]', '[class*="sharing" i]', '[class*="social" i]',
    '[id*="share" i]', '[data-cy*="share" i]', '[data-testid*="share" i]',
    'a[href*="facebook.com/sharer"]', 'a[href*="linkedin.com/shareArticle"]',
    'a[href*="twitter.com/intent"]', 'a[href*="api.whatsapp.com"]',
    'button[aria-label*="share" i]', 'button[aria-label*="partager" i]',
    // Alertes emploi, signalements et boutons de bas de page
    '[class*="report-job" i]', '[class*="reportJob" i]', '[id*="report-job" i]',
    '[data-testid*="jobsearch-ReportJob"]', '[class*="similar-jobs" i]',
    '[class*="job-alert" i]', '[class*="feedback" i]', '[class*="survey" i]',
    '[class*="apply-button-bottom" i]'
  ];

  try {
    for (const selector of noiseSelectors) {
      $(selector).remove();
    }
  } catch {
    // Tolérance d'erreur si un sélecteur n'est pas pris en charge par Cheerio
  }
}

/**
 * Nettoie le texte des descriptions d'offres :
 * - Décode les entités HTML
 * - Supprime les bannières cookies et avertissements RGPD résiduels
 * - Supprime les blocs et boutons de partage réseaux sociaux
 * - Supprime les signalements d'offres et alertes parasites
 * - Harmonise les sauts de lignes
 */
export function cleanJobDescription(raw: string): string {
  if (!raw) return '';

  let str = cleanHtmlText(raw);

  // 1. Nettoyage inline des motifs fréquents de partage et boutons
  str = str
    .replace(/Partager\s+sur(?:\s*\\\*)?(?:\s*\*){3,}/gi, '')
    .replace(/Partager\s+sur\s+(?:Facebook|LinkedIn|Twitter|X|WhatsApp|Email|E-Mail)[^\n]*/gi, '')
    .replace(/###\s*(?:Partager(?:\s+cette\s+offre(?:\s+d'emploi)?)?|Diesen\s+Job\s+teilen|Share\s+this\s+job)[^#]*###(?:\s*\\\*)?(?:\s*\*){3,}/gi, '')
    .replace(/###\s*(?:Partager(?:\s+cette\s+offre(?:\s+d'emploi)?)?|Diesen\s+Job\s+teilen|Share\s+this\s+job)[^#]*###/gi, '');

  // 2. Filtrage ligne par ligne des bannières cookies, partages et signalements
  const noiseLinePatterns: RegExp[] = [
    /^(?:#+\s*)?(?:partager(?:\s+cette\s+(?:offre|annonce)(?:\s+d'emploi)?)?|partager\s+sur|diesen\s+job\s+teilen|share\s+this\s+job)(?:\s*#+)?$/i,
    /^(?:\\\*|\*|\s|-|_|=){3,}$/,
    /^(?:#+\s*)?(?:signaler\s+(?:cette\s+)?(?:offre|annonce)|report\s+this\s+job|diesen\s+job\s+melden)(?:\s*#+)?$/i,
    /^(?:#+\s*)?(?:paramètres\s+des\s+cookies|cookie-einstellungen|cookie\s+settings)(?:\s*#+)?$/i,
    /^(?:#+\s*)?(?:créer\s+une\s+alerte(?:\s+emploi)?|job-alert\s+aktivieren|create\s+job\s+alert)(?:\s*#+)?$/i,
    /(?:ce\s+site\s+utilise\s+des\s+cookies|wir\s+verwenden\s+cookies|we\s+use\s+cookies|en\s+poursuivant\s+votre\s+navigation[,\s]+vous\s+acceptez)/i
  ];

  const lines = str.split('\n');
  const cleanedLines: string[] = [];
  let consecutiveEmpty = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[\t\f\v ]+/g, ' ').trim();
    if (!line) {
      consecutiveEmpty++;
      if (consecutiveEmpty <= 1 && cleanedLines.length > 0) cleanedLines.push('');
      continue;
    }

    if (noiseLinePatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    consecutiveEmpty = 0;
    cleanedLines.push(line);
  }

  return cleanedLines.join('\n').trim();
}

export function calculateJobScore(job: any, profile: any, settings: any): number {
  let score = 50;
  const weights = settings?.weights || {
    keywords_title: 30,
    keywords_desc: 20,
    canton: 15,
    remote: 10,
    workload: 10,
    date: 10,
    skills: 5
  };

  const asLowerStrings = (value: any): string[] =>
    Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().toLowerCase()) : [];
  const posKeywords = asLowerStrings(profile?.positive_keywords?.length ? profile.positive_keywords : settings?.positive_keywords || ['React', 'TypeScript', 'Node.js', 'Full Stack', 'Developer']);
  const negKeywords = asLowerStrings(profile?.negative_keywords?.length ? profile.negative_keywords : settings?.negative_keywords);
  const wantedRoles = asLowerStrings(profile?.wanted_roles);
  const avoidedCompanies = asLowerStrings(profile?.avoided_companies);
  const wantedCantons = (Array.isArray(profile?.wanted_cantons) && profile.wanted_cantons.length ? profile.wanted_cantons : settings?.accepted_cantons || ['GE', 'VD', 'ZH', 'FR', 'NE', 'BE']).map((c: string) => c.toUpperCase());
  const userSkills = asLowerStrings(profile?.skills?.length ? profile.skills : ['React', 'TypeScript', 'Node.js', 'Python', 'SQL']);
  const titleLower = (job.title || '').toLowerCase();
  const descLower = (job.description || '').toLowerCase();
  const companyLower = (job.company || '').toLowerCase();

  for (const neg of negKeywords) {
    if (titleLower.includes(neg) || descLower.includes(neg)) score -= 30;
  }
  for (const avoided of avoidedCompanies) {
    if (companyLower.includes(avoided)) score -= 50;
  }

  const titleMatches = new Set([...posKeywords, ...wantedRoles].filter((term) => titleLower.includes(term)));
  score += Math.min(titleMatches.size * 8, weights.keywords_title);

  let descMatches = 0;
  for (const pos of posKeywords) {
    if (descLower.includes(pos)) descMatches++;
  }
  score += Math.min(descMatches * 3, weights.keywords_desc);

  if (job.canton && wantedCantons.includes(String(job.canton).toUpperCase())) score += weights.canton;
  if (job.remote && profile?.remote_accepted) score += weights.remote;

  const parseRange = (value: any): [number, number] | null => {
    const numbers = String(value || '').match(/\d{2,3}/g)?.map(Number) || [];
    if (!numbers.length) return null;
    return numbers.length > 1 ? [Math.min(numbers[0], numbers[1]), Math.max(numbers[0], numbers[1])] : [numbers[0], numbers[0]];
  };
  const jobWorkload = parseRange(job.workload);
  const profileWorkload = parseRange(profile?.workload) || [
    Number(settings?.workload_min ?? 80),
    Number(settings?.workload_max ?? 100)
  ];
  if (jobWorkload) {
    if (jobWorkload[1] >= profileWorkload[0] && jobWorkload[0] <= profileWorkload[1]) {
      score += Number(weights.workload) || 0;
    } else {
      score -= 10;
    }
  }

  const wantedContracts = asLowerStrings(profile?.contract_types);
  const jobContract = String(job.contract_type || '').toLowerCase();
  if (wantedContracts.length && jobContract) {
    if (wantedContracts.some((contract) => jobContract.includes(contract) || contract.includes(jobContract))) score += 5;
    else score -= 5;
  }

  let skillMatches = 0;
  for (const skill of userSkills) {
    if (descLower.includes(skill) || titleLower.includes(skill)) skillMatches++;
  }
  score += Math.min(skillMatches * 2, weights.skills);

  if (job.published_at) {
    const pubTime = new Date(job.published_at).getTime();
    if (Number.isFinite(pubTime)) {
      const hoursAgo = (Date.now() - pubTime) / (1000 * 3600);
      if (hoursAgo >= 0 && hoursAgo <= 48) score += weights.date;
      else if (hoursAgo > 48 && hoursAgo <= 168) score += Math.round(weights.date / 2);
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildProfileSearchQueries(profile: any): string[] {
  const toStrings = (value: any): string[] => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : [];

  const roles = toStrings(profile?.wanted_roles);
  const skills = toStrings(profile?.skills);
  const sectors = toStrings(profile?.sectors);
  const positiveKeywords = toStrings(profile?.positive_keywords);
  const experienceTitles: string[] = [];
  const experienceMissions: string[] = [];

  if (Array.isArray(profile?.experiences)) {
    for (const experience of profile.experiences) {
      if (typeof experience === 'string') {
        experienceTitles.push(experience);
        continue;
      }
      if (typeof experience?.title === 'string') experienceTitles.push(experience.title);
      for (const field of [experience?.realizations, experience?.achievements]) {
        experienceMissions.push(...toStrings(field));
      }
      if (typeof experience?.description === 'string' && experience.description.trim()) {
        experienceMissions.push(experience.description.trim());
      }
    }
  }
  if (typeof profile?.current_title === 'string' && profile.current_title.trim()) {
    experienceTitles.push(profile.current_title.trim());
  }

  const groups = [
    roles,
    experienceMissions,
    skills,
    sectors,
    experienceTitles,
    positiveKeywords
  ];
  const queries: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < Math.max(...groups.map((group) => group.length), 0); index++) {
    for (const group of groups) {
      const candidate = group[index];
      if (!candidate) continue;
      const normalized = candidate.toLocaleLowerCase('fr').trim();
      if (normalized.length < 3 || seen.has(normalized)) continue;
      seen.add(normalized);
      queries.push(candidate);
      if (queries.length >= 4) return queries;
    }
  }

  return queries.length ? queries : ['emploi'];
}

export function formatProfileExperiences(experiences: any): string {
  if (!experiences) return '';
  if (Array.isArray(experiences)) {
    return experiences.map((exp: any) => {
      const parts = [];
      if (exp.title) parts.push(exp.title);
      if (exp.company) parts.push(`chez ${exp.company}`);
      if (exp.start_date || exp.end_date || exp.dates) {
        parts.push(`(${[exp.start_date, exp.end_date].filter(Boolean).join(' - ') || exp.dates})`);
      }
      if (exp.location) parts.push(`[${exp.location}]`);
      const details = parts.join(' ');
      const reals = Array.isArray(exp.realizations) && exp.realizations.length > 0
        ? `\n  * ` + exp.realizations.join('\n  * ')
        : (exp.description ? `\n  ${exp.description}` : '');
      return `- ${details}${reals}`;
    }).join('\n');
  }
  return typeof experiences === 'string' ? experiences : '';
}

export function formatProfileFormations(formations: any): string {
  if (!formations) return '';
  if (Array.isArray(formations)) {
    return formations.map((f: any) => {
      const parts = [];
      if (f.diploma) parts.push(f.diploma);
      if (f.institution) parts.push(`(${f.institution})`);
      if (f.start_date || f.end_date || f.dates) {
        parts.push(`[${[f.start_date, f.end_date].filter(Boolean).join(' - ') || f.dates}]`);
      }
      return `- ${parts.join(' ')}`;
    }).join('\n');
  }
  return typeof formations === 'string' ? formations : '';
}
