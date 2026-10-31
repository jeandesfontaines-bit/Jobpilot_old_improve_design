import { checkJobExclusions, normalizeText } from './exclusionMatcher.ts';
export interface Criteria { wanted_cantons?: string[]; excluded_roles?: string[]; negative_keywords?: string[]; avoided_companies?: string[]; workload?: string; salary_min?: string; }
export interface CandidateJob { title?: string; description?: string; company?: string; canton?: string; workload?: string; salary?: string | number | null; }
export interface CriteriaResult { excluded: boolean; reasons: string[]; unknown: string[]; }
const list = (v?: string[]) => (v || []).filter(x => typeof x === 'string').map(x => x.trim()).filter(Boolean);
function percentages(v: unknown): number[] {
  const s = String(v ?? '').trim();
  if (!s || !/^[\d\s%,.\-–—]+$/.test(s)) return [];
  const values = (s.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')));
  return values.length && values.every(x => x >= 0 && x <= 100) ? values : [];
}
function annualCHF(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 10000 ? v : null;
  const s = String(v ?? '').trim();
  if (!s || /eur|usd|gbp|€|\$|month|mois|monat|hour|heure|stunde/i.test(s)) return null;
  const amounts = (s.match(/\d{1,3}(?:[ '’\u00a0]\d{3})+(?:[.,]\d{1,2})?|\d{5,7}/g) || []).map(x => Number(x.replace(/[ '’\u00a0]/g, '').replace(',', '.')));
  return amounts.length && amounts.every(x => Number.isFinite(x) && x >= 10000) ? Math.max(...amounts) : null;
}
function containsPhrase(text: string, phrase: string): boolean {
  const tokens = (s: string) => normalizeText(s).match(/[a-z0-9]+/g) || [];
  const haystack = ` ${tokens(text).join(' ')} `;
  const needle = tokens(phrase).join(' ');
  return Boolean(needle) && haystack.includes(` ${needle} `);
}
export function evaluateSearchCriteria(job: CandidateJob, criteria: Criteria): CriteriaResult {
  const reasons: string[] = [];
  const unknown: string[] = [];
  const role = checkJobExclusions(job.title || '', criteria.excluded_roles);
  if (role.isExcluded) reasons.push(role.reason || 'Poste exclu');
  const content = `${job.title || ''} ${job.description || ''}`;
  for (const word of list(criteria.negative_keywords)) if (containsPhrase(content, word)) reasons.push(`Expression exclue : ${word}`);
  for (const company of list(criteria.avoided_companies)) if (containsPhrase(job.company || '', company)) reasons.push(`Entreprise exclue : ${company}`);
  const allowed = list(criteria.wanted_cantons).map(x => x.toUpperCase());
  const canton = String(job.canton || '').trim().toUpperCase();
  if (allowed.length) {
    if (!canton) unknown.push('Canton non renseigné');
    else if (!allowed.includes(canton)) reasons.push(`Canton non autorisé : ${canton}`);
  }
  const maximumValues = percentages(criteria.workload);
  const maximum = maximumValues.length ? Math.max(...maximumValues) : 100;
  if (maximum < 100) {
    const offered = percentages(job.workload);
    if (!offered.length) unknown.push('Taux non renseigné ou non interprétable');
    else if (Math.min(...offered) > maximum) reasons.push(`Taux minimum de l’offre supérieur au maximum de ${maximum} %`);
  }
  const minimum = annualCHF(criteria.salary_min);
  if (minimum !== null) {
    const offered = annualCHF(job.salary);
    if (offered === null) unknown.push('Salaire non renseigné ou non comparable en CHF annuels');
    else if (offered < minimum) reasons.push(`Salaire maximal annoncé inférieur au minimum de ${minimum} CHF/an`);
  }
  return { excluded: reasons.length > 0, reasons, unknown };
}
