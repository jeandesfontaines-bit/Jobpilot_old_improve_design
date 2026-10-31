const PORTALS = [
  'jobup', 'jobs.ch', 'jobsch', 'linkedin', 'indeed', 'jobscout24',
  'jobwinner', 'jobeo', 'job-room', 'jobroom', 'travail.swiss',
];
export const isPortalName = (company?: string | null): boolean => {
  const n = (company || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!n) return false;
  return PORTALS.some((p) => n === p || n === `${p}.ch`);
};
export const companyLabel = (company?: string | null): string => {
  const c = (company || '').trim();
  if (!c) return 'Employeur non renseigné';
  return isPortalName(c) ? 'Employeur non renseigné' : c;
};
export const workloadLabel = (workload?: string | null): string => {
  const parts = (workload || '').split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  return Array.from(new Set(parts)).join(' - ');
};
export const formatDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-CH');
};
export const relativeDate = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return '1 jour';
  if (days < 30) return `${days} jours`;
  return d.toLocaleDateString('fr-CH');
};
const DOMAIN_LABELS: Array<[string, string]> = [
  ['jobup.ch', 'Jobup'], ['jobs.ch', 'Jobs.ch'], ['linkedin.com', 'LinkedIn'],
  ['indeed.com', 'Indeed'], ['indeed.ch', 'Indeed'], ['jobscout24.ch', 'JobScout24'],
  ['jobwinner.ch', 'Jobwinner'], ['jobeo.ch', 'Jobeo'], ['travail.swiss', 'travail.swiss'],
];
export const normalizeJobUrl = (url?: string | null): string => {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  let candidate = trimmed;
  if (candidate.startsWith('//')) {
    candidate = `https:${candidate}`;
  } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    if (!/^https?:\/\//i.test(candidate)) {
      return '';
    }
  } else {
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    if (!host || /\s/.test(host)) return '';
    const isLocalhost = host === 'localhost';
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const hasValidDomain = host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
    if (!isLocalhost && !isIpv4 && !hasValidDomain) return '';
    return parsed.toString();
  } catch {
    return '';
  }
};
export const originPortal = (url?: string | null): string => {
  try {
    const normalized = normalizeJobUrl(url);
    if (!normalized) return '';
    const host = new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host.endsWith('job-room.ch')) return '';
    const hit = DOMAIN_LABELS.find(([d]) => host === d || host.endsWith(`.${d}`));
    return hit ? hit[1] : host;
  } catch { return ''; }
};
const STOP = new Set([
  'rejoignez', 'rejoindre', 'chez', 'nous', 'notre', 'nos', 'le', 'la', 'les', 'un', 'une',
  'pour', 'vous', 'votre', 'dans', 'au', 'aux', 'en', 'et', 'de', 'du', 'des',
  'description', 'mission', 'profil', 'tâches', 'taches', 'compétences', 'competences',
  'entreprise', 'société', 'societe',
]);
const TOKEN = "[A-Z\u00c0-\u00dd][\\w\u00c0-\u00ff&.'\u2019-]*";
const LEGAL = new RegExp(`\\b(${TOKEN}(?: ${TOKEN}){0,3}) (SA|AG|Sàrl|Sarl|GmbH|Ltd|PLC|Inc|SAS)\\b`);
const GROUP = new RegExp(`\\b(${TOKEN}(?: ${TOKEN}){0,2}) (Group|Groupe|Holding)\\b`);
const stripLeadingStopwords = (name: string): string => {
  const tokens = name.split(' ');
  while (tokens.length && STOP.has(tokens[0].toLowerCase())) tokens.shift();
  return tokens.join(' ');
};
export const guessEmployer = (description?: string | null): string => {
  const text = (description || '').replace(/\s+/g, ' ');
  for (const re of [LEGAL, GROUP]) {
    const m = text.match(re);
    if (m) {
      const name = stripLeadingStopwords(m[1]);
      if (name.length >= 3) return `${name} ${m[2]}`;
    }
  }
  return '';
};
export const employerLabel = (job: { company?: string | null; description?: string | null; url?: string | null }): string => {
  const c = (job.company || '').trim();
  if (c && !isPortalName(c)) return c;
  const guess = guessEmployer(job.description);
  if (guess) return `${guess} (probable)`;
  return 'Employeur non renseigné';
};
