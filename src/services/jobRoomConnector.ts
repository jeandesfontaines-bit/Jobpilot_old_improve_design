import axios from 'axios';
import { cleanJobDescription } from './swissJobHelpers.ts';
import { normalizeJobUrl } from '../lib/jobs.ts';

export interface JobRoomScrapeOptions {
  maxPages?: number;
  cantonCodes?: string[];
  onlineSince?: number | null;
  pageSize?: number;
  delayMinMs?: number;
  delayMaxMs?: number;
  testUrl?: string;
  onPageFetched?: (page: number, itemsCount: number, detectedTotal: number, uniqueDetected: number, totalReported: number | null) => void;
}

export interface JobRoomScrapeResult {
  detected: number;
  uniqueDetected: number;
  totalReported: number | null;
  pagesFetched: number;
  jobs: any[];
  status: 'completed' | 'partial' | 'page_repeated' | 'max_pages_reached' | 'error' | 'inconsistent';
  error: string | null;
  methodUsed: string;
}

const CANTON_MAP: Record<string, string[]> = {
  GE: ['GENEVE', 'GENEVA', 'VERNIER', 'MEYRIN', 'LANCY', 'CAROUGE', 'PLAN-LES-OUATES'],
  VD: ['VAUD', 'LAUSANNE', 'YVERDON', 'MONTREUX', 'NYON', 'VEVEY', 'MORGES', 'PUIDOUX', 'RENENS', 'GLAND'],
  ZH: ['ZURICH', 'WINTERTHUR', 'USTER', 'DUBENDORF', 'DIETIKON'],
  BE: ['BERN', 'BERNE', 'BIEL', 'BIENNE', 'THUN'],
  BS: ['BASEL', 'BALE'], FR: ['FRIBOURG', 'FREIBURG', 'BULLE'],
  NE: ['NEUCHATEL', 'LA CHAUX-DE-FONDS', 'LE LOCLE'],
  VS: ['VALAIS', 'WALLIS', 'SION', 'SIERRE', 'MARTIGNY'],
  TI: ['TICINO', 'TESSIN', 'LUGANO'], SG: ['ST. GALLEN', 'SAINT-GALL'],
  LU: ['LUZERN', 'LUCERNE'], SO: ['SOLOTHURN', 'SOLEURE'],
  AG: ['AARGAU', 'ARGOVIE', 'AARAU'], JU: ['JURA', 'DELEMONT']
};

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export function detectSwissCanton(locationStr: string, text: string): string {
  const combined = ` ${normalized(`${locationStr || ''} ${text || ''}`).replace(/[^A-Z0-9]+/g, ' ')} `;
  const found = Object.entries(CANTON_MAP).filter(([code, names]) =>
    [code, ...names].some(name => combined.includes(` ${normalized(name).replace(/[^A-Z0-9]+/g, ' ')} `))
  );
  return found.length === 1 ? found[0][0] : '';
}

export function cleanHtmlText(text: string): string {
  return String(text || '')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"').replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function structuredCanton(value: unknown): string {
  const code = normalized(value);
  const match = code.match(/^(?:CH[-_])?([A-Z]{2})$/);
  return match ? match[1] : detectSwissCanton(code, '');
}

export function extractJobRoomAd(raw: any, targetCantons: string[] = ['GE', 'VD']): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const ad = raw.jobAdvertisement || raw;
  const id = ad.id ?? ad.uuid;
  if (id == null || String(id).trim() === '') return null;
  const content = ad.jobContent || {};
  const descriptions = Array.isArray(content.jobDescriptions) ? content.jobDescriptions : [];
  const descObj = descriptions.find((d: any) => d?.languageIsoCode === 'fr') || descriptions[0] || {};
  const title = cleanHtmlText(descObj.title || ad.title || 'Offre Job-Room');
  const company = cleanHtmlText(content.company?.name || ad.company?.name || 'Entreprise Suisse');
  const locations = [
    ...(Array.isArray(content.locations) ? content.locations : []),
    ...(content.location ? [content.location] : []),
    ...(Array.isArray(ad.locations) ? ad.locations : []),
    ...(ad.location ? [ad.location] : [])
  ].filter((loc: any) => loc && typeof loc === 'object');
  const mapped = locations.map((loc: any) => ({
    city: cleanHtmlText(loc.city || loc.postalCode || ''),
    canton: structuredCanton(loc.cantonCode || loc.regionCode || '')
  }));
  const targets = targetCantons.map(normalized);
  const selected = mapped.find(loc => targets.includes(loc.canton)) || mapped[0];
  const canton = selected?.canton || '';
  const locality = selected?.city || 'Suisse';
  const description = cleanJobDescription(descObj.description || ad.description || '') || 'Description détaillée disponible sur Job-Room.';
  const min = content.employment?.workloadPercentageMin;
  const max = content.employment?.workloadPercentageMax;
  const workload = min == null && max == null ? '' : (min === max || min == null || max == null ? `${min ?? max}%` : `${min}% - ${max}%`);
  const lower = `${title} ${description}`.toLowerCase();
  return {
    source: 'job_room', external_id: `jobroom_${id}`, title, company,
    location: [locality, canton].filter(Boolean).join(', '), canton,
    contract_type: content.employment?.permanent !== false ? 'CDI' : 'Temporaire',
    workload,
    remote: lower.includes('télétravail') || lower.includes('home office') || lower.includes('remote') ||
      (Array.isArray(content.employment?.workForms) && content.employment.workForms.includes('HOME_WORK')),
    salary: null,
    published_at: ad.publication?.startDate || ad.createdTime || new Date().toISOString(),
    discovered_at: new Date().toISOString(),
    url: normalizeJobUrl(content.externalUrl) || `https://www.job-room.ch/fr/job-advertisement/${id}`,
    description, status: 'Nouvelle', alternate_sources: JSON.stringify([])
  };
}

function itemsFromResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of ['content', 'jobAdvertisements', 'results']) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        if (!Array.isArray(data[key])) throw new Error(`Conteneur Job-Room non tabulaire : ${key}`);
        return data[key];
      }
    }
  }
  throw new Error('Format de réponse Job-Room inconnu ou invalide');
}

function reportedTotal(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) throw new Error('En-tête x-total-count invalide');
  const total = Number(text);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('En-tête x-total-count invalide');
  return total;
}

/** Collects in memory; persistence remains the caller's responsibility.
 * A completed status is not a guarantee of a stable source snapshot.
 */
export async function scrapeJobRoom(options: JobRoomScrapeOptions = {}): Promise<JobRoomScrapeResult> {
  const { maxPages, cantonCodes = ['GE', 'VD'], onlineSince = null, pageSize = 50,
    delayMinMs = 1500, delayMaxMs = 5000, testUrl, onPageFetched } = options;
  if (!Number.isInteger(pageSize) || pageSize < 1 ||
      (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1)) ||
      !Number.isFinite(delayMinMs) || !Number.isFinite(delayMaxMs) || delayMinMs < 0 || delayMaxMs < delayMinMs) {
    throw new Error('Options de pagination Job-Room invalides');
  }
  if (onlineSince != null && (!Number.isInteger(onlineSince) || onlineSince < 1 || onlineSince > 60)) {
    throw new Error('onlineSince doit être un entier de 1 à 60 jours (ou null)');
  }
  const baseUrl = testUrl || 'https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search';
  const headers = {
    Accept: 'application/json', 'Accept-Language': 'fr', 'Content-Type': 'application/json',
    'User-Agent': 'JobPilot/1.0', Referer: 'https://www.job-room.ch/fr/job-search'
  };
  const body: any = { keywords: [], cantonCodes, companyName: null, displayRestricted: false, communalCodes: [] };
  if (onlineSince != null) body.onlineSince = onlineSince;
  const result: JobRoomScrapeResult = {
    detected: 0, uniqueDetected: 0, totalReported: null, pagesFetched: 0, jobs: [],
    status: 'completed', error: null, methodUsed: 'Requêtes internes du site public Job-Room (POST _search)'
  };
  const seen = new Set<string>();
  const finish = () => {
    if (result.totalReported !== null && seen.size < result.totalReported) {
      result.status = 'inconsistent';
      result.error = `Fin annoncée après ${seen.size} identifiants uniques ; total source : ${result.totalReported}.`;
    }
    return result;
  };
  let page = 0;
  while (true) {
    if (maxPages !== undefined && page >= maxPages) {
      result.status = 'max_pages_reached';
      return result;
    }
    if (page > 0) await new Promise(resolve => setTimeout(resolve,
      Math.floor(Math.random() * (delayMaxMs - delayMinMs + 1)) + delayMinMs));
    const url = new URL(baseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(pageSize));
    url.searchParams.set('sort', 'date_desc');
    let response: any;
    try {
      response = await axios.post(url.toString(), body, { headers, timeout: 30000 });
    } catch (error: any) {
      const status = error.response?.status;
      // A 412 alone is not evidence that all results were retrieved.
      if (status === 412 && page > 0 && result.totalReported !== null) return finish();
      result.status = result.jobs.length ? 'partial' : 'error';
      result.error = error.message || `Erreur HTTP ${status || 'inconnue'}`;
      return result;
    }
    result.pagesFetched++;
    let items: any[];
    try {
      items = itemsFromResponse(response.data);
      const currentTotal = reportedTotal(response.headers?.['x-total-count']);
      if (currentTotal !== null && result.totalReported === null) result.totalReported = currentTotal;
      else if (currentTotal !== null && currentTotal !== result.totalReported) {
        throw new Error(`Le total source a changé pendant la collecte (${result.totalReported} → ${currentTotal}) ; relancer pour vérifier la couverture.`);
      }
      for (const raw of items) {
        const ad = raw?.jobAdvertisement || raw;
        if (!ad || typeof ad !== 'object' || (ad.id == null && ad.uuid == null) || String(ad.id ?? ad.uuid).trim() === '') {
          throw new Error('Annonce Job-Room sans identifiant valide');
        }
      }
    } catch (error: any) {
      result.status = result.jobs.length ? 'partial' : 'error';
      result.error = error.message;
      return result;
    }
    result.detected += items.length;
    if (!items.length) return finish();
    let added = 0;
    for (const raw of items) {
      const ad = raw.jobAdvertisement || raw;
      const id = String(ad.id ?? ad.uuid);
      if (seen.has(id)) continue;
      const job = extractJobRoomAd(raw, cantonCodes);
      if (job) { seen.add(id); result.jobs.push(job); added++; }
    }
    result.uniqueDetected = seen.size;

    if (onPageFetched) {
      try { onPageFetched(page, items.length, result.detected, result.uniqueDetected, result.totalReported); }
      catch (error: any) {
        result.status = 'partial'; result.error = `Erreur du suivi de collecte : ${error.message}`; return result;
      }
    }
    const link = String(response.headers?.link || '');
    const hasNext = /\brel\s*=\s*(?:"[^"]*\bnext\b[^"]*"|'[^']*\bnext\b[^']*'|next\b)/i.test(link);
    if (!hasNext) return finish();
    // A short page with an explicit next link is not, by itself, the end.
    page++;
  }
}
