/**
 * Routes Scraping & Connecteurs Emploi Suisses.
 * Gère la collecte des offres (jobs.ch, jobup.ch, indeed, linkedin, jobwinner, jobeo, job_room)
 * et le suivi des tâches de fond en temps réel.
 */
import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { readTable, writeTable, mutateTable } from '../db.ts';
import { scrapeJobRoom } from '../../src/services/jobRoomConnector.ts';
import { normalizeJobUrl } from '../../src/lib/jobs.ts';
import {
  detectSwissCanton,
  detectWorkload,
  cleanHtmlText,
  cleanCompanyName,
  stripDomNoise,
  cleanJobDescription,
  calculateJobScore,
  buildProfileSearchQueries
} from '../../src/services/swissJobHelpers.ts';

const router = Router();

export interface ScrapingTask {
  id: string;
  source: string;
  status: 'collecting' | 'saving' | 'completed' | 'partial' | 'error';
  pagesFetched: number;
  uniqueFetched: number;
  totalReported: number | null;
  newSaved: number;
  startTime: string;
  elapsedSeconds: number;
  error: string | null;
  message: string;
}

const updateTask = (taskId: string, mutator: (task: ScrapingTask) => void) => {
  const tasks = readTable('scraping_tasks') as ScrapingTask[];
  const idx = tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) {
    mutator(tasks[idx]);
    tasks[idx].elapsedSeconds = Math.round((Date.now() - new Date(tasks[idx].startTime).getTime()) / 1000);
    void writeTable('scraping_tasks', tasks);
  }
};

/**
 * Délai aléatoire uniforme compris entre minMs et maxMs (défaut: 500 à 4000 ms).
 * Utilise await pour garantir que le délai est respecté avant la requête suivante.
 */
function waitRandomDelay(minMs = 500, maxMs = 4000): Promise<number> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(() => resolve(delay), delay));
}

// Real Scraper for jobs.ch
async function scrapeJobsCh(keyword = 'developpeur') {
  const searchUrl = `https://www.jobs.ch/fr/offres-emplois/?term=${encodeURIComponent(keyword)}`;
  const searchRes = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
    },
    timeout: 10000
  });

  const $ = cheerio.load(searchRes.data);
  const detailUrls: string[] = [];
  $('a[href*="/fr/offres-emplois/detail/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const full = href.startsWith('http') ? href : `https://www.jobs.ch${href}`;
      if (!detailUrls.includes(full)) detailUrls.push(full);
    }
  });

  const jobsFound: any[] = [];
  for (let i = 0; i < Math.min(detailUrls.length, 6); i++) {
    const url = detailUrls[i];
    try {
      await waitRandomDelay(500, 4000);
      const dRes = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });
      const $d = cheerio.load(dRes.data);
      let jobPosting: any = null;
      $d('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($d(el).html() || '{}');
          if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
        } catch (e) {}
      });

      stripDomNoise($d);

      const title = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
      const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || $d('[data-cy="company-name"]').text().trim() || 'Entreprise en Suisse');
      const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
      const region = jobPosting?.jobLocation?.address?.addressRegion || '';
      const street = jobPosting?.jobLocation?.address?.streetAddress || '';
      const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || street || 'Suisse');
      const canton = detectSwissCanton(location + ' ' + region, title);
      const contractType = cleanHtmlText(jobPosting?.employmentType || 'CDI');
      const rawDesc = jobPosting?.description || $d('[data-cy="vacancy-description"]').text().trim() || '';
      const cleanDesc = cleanJobDescription(rawDesc);

      const externalId = url.split('/detail/')[1]?.replace(/\//g, '') || String(Date.now());

      jobsFound.push({
        source: 'jobs_ch',
        external_id: `jobsch_${externalId}`,
        title,
        company,
        location: location || 'Genève',
        canton,
        contract_type: contractType,
        workload: detectWorkload(title, cleanDesc),
        remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote'),
        salary: null,
        published_at: jobPosting?.datePosted || new Date().toISOString(),
        discovered_at: new Date().toISOString(),
        url,
        description: cleanDesc || 'Offre complète disponible sur jobs.ch.',
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });
    } catch (err: any) {
      console.warn(`Scraping detail error (${url}):`, err.message);
    }
  }

  return { detected: detailUrls.length, jobs: jobsFound };
}

// Real Scraper for jobup.ch
async function scrapeJobupCh(keyword = 'developpeur') {
  const searchUrl = `https://www.jobup.ch/fr/emplois/?term=${encodeURIComponent(keyword)}`;
  const searchRes = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
    },
    timeout: 10000
  });

  const $ = cheerio.load(searchRes.data);
  const detailUrls: string[] = [];
  $('a[href*="/fr/emplois/detail/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const full = href.startsWith('http') ? href : `https://www.jobup.ch${href}`;
      if (!detailUrls.includes(full)) detailUrls.push(full);
    }
  });

  const jobsFound: any[] = [];
  for (let i = 0; i < Math.min(detailUrls.length, 6); i++) {
    const url = detailUrls[i];
    try {
      await waitRandomDelay(500, 4000);
      const dRes = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });
      const $d = cheerio.load(dRes.data);
      let jobPosting: any = null;
      $d('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($d(el).html() || '{}');
          if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
        } catch (e) {}
      });

      stripDomNoise($d);

      const title = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
      const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || $d('[data-cy="company-name"]').text().trim() || 'Entreprise en Suisse romande');
      const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
      const region = jobPosting?.jobLocation?.address?.addressRegion || '';
      const street = jobPosting?.jobLocation?.address?.streetAddress || '';
      const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || street || 'Suisse romande');
      const canton = detectSwissCanton(location + ' ' + region, title);
      const contractType = cleanHtmlText(jobPosting?.employmentType || 'CDI');
      const rawDesc = jobPosting?.description || $d('[data-cy="vacancy-description"]').text().trim() || '';
      const cleanDesc = cleanJobDescription(rawDesc);

      const externalId = url.split('/detail/')[1]?.replace(/\//g, '') || String(Date.now());

      jobsFound.push({
        source: 'jobup_ch',
        external_id: `jobup_${externalId}`,
        title,
        company,
        location: location || 'Lausanne',
        canton,
        contract_type: contractType,
        workload: detectWorkload(title, cleanDesc),
        remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote'),
        salary: null,
        published_at: jobPosting?.datePosted || new Date().toISOString(),
        discovered_at: new Date().toISOString(),
        url,
        description: cleanDesc || 'Offre complète disponible sur jobup.ch.',
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });
    } catch (err: any) {
      console.warn(`Scraping detail error (${url}):`, err.message);
    }
  }

  return { detected: detailUrls.length, jobs: jobsFound };
}

// Real Scraper for indeed_ch (https://ch.indeed.com/jobs)
async function scrapeIndeedCh(keyword = 'developpeur') {
  let detected = 0;
  const jobsFound: any[] = [];
  let methodUsed = 'Playwright headless (Chromium)';

  // 1. Essai initial avec Cheerio (HTTP direct rapide)
  let directHtml = '';
  try {
    const searchUrl = `https://ch.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=Suisse`;
    const searchRes = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
      },
      timeout: 10000
    });
    if (searchRes.status === 200 && !searchRes.data.includes('Security Check') && !searchRes.data.includes('Request Blocked')) {
      directHtml = searchRes.data;
      methodUsed = 'Cheerio HTML extraction';
    }
  } catch (axiosErr: any) {
    console.warn(`[indeed_ch] Requête HTTP Cheerio bloquée (${axiosErr.message}), bascule vers Playwright headless.`);
  }

  // 2. Si HTTP direct est bloqué par Cloudflare, utilisation de Playwright headless
  if (!directHtml || directHtml.includes('Security Check') || directHtml.includes('Request Blocked')) {
    let browser: any = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1920,1080'
        ]
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'fr-CH',
        timezoneId: 'Europe/Zurich',
        viewport: { width: 1920, height: 1080 }
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      const searchUrl = `https://ch.indeed.com/jobs?q=${encodeURIComponent(keyword)}&l=Suisse`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(3000);

      const title = await page.title();
      const bodyText = await page.innerText('body').catch(() => '');

      if (
        title.includes('Security Check') ||
        title.includes('Blocked') ||
        bodyText.includes('Additional Verification Required') ||
        bodyText.includes('Request Blocked')
      ) {
        throw new Error("Cloudflare 403 (Security Check / Additional Verification Required - protection WAF anti-bot active sur Indeed pour les adresses IP cloud)");
      }

      const html = await page.content();
      const $ = cheerio.load(html);
      const detailUrls: string[] = [];

      $('a[href*="/viewjob"], a[href*="/rc/clk"], a[data-jk]').each((_, el) => {
        const href = $(el).attr('href');
        const jk = $(el).attr('data-jk') || (href && href.match(/jk=([a-zA-Z0-9]+)/)?.[1]);
        if (jk) {
          const full = `https://ch.indeed.com/viewjob?jk=${jk}`;
          if (!detailUrls.includes(full)) detailUrls.push(full);
        }
      });

      detected = detailUrls.length;

      for (let i = 0; i < Math.min(detailUrls.length, 6); i++) {
        const url = detailUrls[i];
        await waitRandomDelay(500, 4000);
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1000);
          const detailHtml = await page.content();
          const $d = cheerio.load(detailHtml);

          let jobPosting: any = null;
          $d('script[type="application/ld+json"]').each((_, el) => {
            try {
              const parsed = JSON.parse($d(el).html() || '{}');
              if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
            } catch (e) {}
          });

          stripDomNoise($d);

          const jobTitle = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
          const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || $d('[data-testid="inlineHeader-companyName"]').text().trim() || 'Entreprise en Suisse');
          const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
          const region = jobPosting?.jobLocation?.address?.addressRegion || '';
          const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || 'Suisse');
          const canton = detectSwissCanton(location + ' ' + region, jobTitle);
          const contractType = cleanHtmlText(jobPosting?.employmentType || 'CDI');
          const rawDesc = jobPosting?.description || $d('#jobDescriptionText').text().trim() || '';
          const cleanDesc = cleanJobDescription(rawDesc);
          const jk = url.match(/jk=([a-zA-Z0-9]+)/)?.[1] || String(Date.now());

          jobsFound.push({
            source: 'indeed_ch',
            external_id: `indeed_${jk}`,
            title: jobTitle,
            company,
            location: location || 'Genève',
            canton,
            contract_type: contractType,
            workload: detectWorkload(jobTitle, cleanDesc),
            remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || jobTitle.toLowerCase().includes('remote'),
            salary: null,
            published_at: jobPosting?.datePosted || new Date().toISOString(),
            discovered_at: new Date().toISOString(),
            url,
            description: cleanDesc || 'Offre complète disponible sur ch.indeed.com.',
            status: 'Nouvelle',
            alternate_sources: JSON.stringify([])
          });
        } catch (detailErr: any) {
          console.warn(`[indeed_ch] Erreur lecture détail (${url}):`, detailErr.message);
        }
      }
    } finally {
      if (browser) await browser.close();
    }
  } else {
    const $ = cheerio.load(directHtml);
    const detailUrls: string[] = [];
    $('a[href*="/viewjob"], a[href*="/rc/clk"], a[data-jk]').each((_, el) => {
      const href = $(el).attr('href');
      const jk = $(el).attr('data-jk') || (href && href.match(/jk=([a-zA-Z0-9]+)/)?.[1]);
      if (jk) {
        const full = `https://ch.indeed.com/viewjob?jk=${jk}`;
        if (!detailUrls.includes(full)) detailUrls.push(full);
      }
    });

    detected = detailUrls.length;

    for (let i = 0; i < Math.min(detailUrls.length, 6); i++) {
      const url = detailUrls[i];
      await waitRandomDelay(500, 4000);
      try {
        const dRes = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });
        const $d = cheerio.load(dRes.data);
        let jobPosting: any = null;
        $d('script[type="application/ld+json"]').each((_, el) => {
          try {
            const parsed = JSON.parse($d(el).html() || '{}');
            if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
          } catch (e) {}
        });

        stripDomNoise($d);

        const jobTitle = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
        const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || $d('[data-testid="inlineHeader-companyName"]').text().trim() || 'Entreprise en Suisse');
        const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
        const region = jobPosting?.jobLocation?.address?.addressRegion || '';
        const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || 'Suisse');
        const canton = detectSwissCanton(location + ' ' + region, jobTitle);
        const contractType = cleanHtmlText(jobPosting?.employmentType || 'CDI');
        const rawDesc = jobPosting?.description || $d('#jobDescriptionText').text().trim() || '';
        const cleanDesc = cleanJobDescription(rawDesc);
        const jk = url.match(/jk=([a-zA-Z0-9]+)/)?.[1] || String(Date.now());

        jobsFound.push({
          source: 'indeed_ch',
          external_id: `indeed_${jk}`,
          title: jobTitle,
          company,
          location: location || 'Genève',
          canton,
          contract_type: contractType,
          workload: detectWorkload(jobTitle, cleanDesc),
          remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || jobTitle.toLowerCase().includes('remote'),
          salary: null,
          published_at: jobPosting?.datePosted || new Date().toISOString(),
          discovered_at: new Date().toISOString(),
          url,
          description: cleanDesc || 'Offre complète disponible sur ch.indeed.com.',
          status: 'Nouvelle',
          alternate_sources: JSON.stringify([])
        });
      } catch (err: any) {
        console.warn(`[indeed_ch] Erreur lecture détail (${url}):`, err.message);
      }
    }
  }

  return { detected, jobs: jobsFound, methodUsed };
}

// Real Scraper for jobwinner (https://www.jobwinner.ch)
async function scrapeJobwinner(keyword = 'developpeur') {
  const searchUrl = `https://www.jobwinner.ch/jobs?q=${encodeURIComponent(keyword)}`;
  const searchRes = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
    },
    timeout: 10000
  });

  const $ = cheerio.load(searchRes.data);
  const detailUrls: string[] = [];
  $('a[href*="/job/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const full = href.startsWith('http') ? href : `https://www.jobwinner.ch${href}`;
      if (!detailUrls.includes(full)) detailUrls.push(full);
    }
  });

  const jobsFound: any[] = [];
  for (let i = 0; i < Math.min(detailUrls.length, 6); i++) {
    const url = detailUrls[i];
    try {
      await waitRandomDelay(500, 4000);
      const dRes = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });
      const $d = cheerio.load(dRes.data);
      let jobPosting: any = null;
      $d('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($d(el).html() || '{}');
          if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
        } catch (e) {}
      });

      stripDomNoise($d);

      const title = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
      const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || $d('[data-cy="company-name"]').text().trim() || 'Entreprise en Suisse');
      const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
      const region = jobPosting?.jobLocation?.address?.addressRegion || '';
      const street = jobPosting?.jobLocation?.address?.streetAddress || '';
      const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || street || 'Suisse');
      const canton = detectSwissCanton(location + ' ' + region, title);
      const contractType = cleanHtmlText(Array.isArray(jobPosting?.employmentType) ? jobPosting.employmentType.join(', ') : (jobPosting?.employmentType || 'CDI'));
      const rawDesc = jobPosting?.description || $d('[data-cy="vacancy-description"]').text().trim() || '';
      const cleanDesc = cleanJobDescription(rawDesc);
      const externalId = url.split('/job/')[1]?.replace(/\//g, '') || String(Date.now());

      jobsFound.push({
        source: 'jobwinner',
        external_id: `jobwinner_${externalId}`,
        title,
        company,
        location: location || 'Suisse',
        canton,
        contract_type: contractType,
        workload: detectWorkload(title, cleanDesc),
        remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote'),
        salary: null,
        published_at: jobPosting?.datePosted || new Date().toISOString(),
        discovered_at: new Date().toISOString(),
        url,
        description: cleanDesc || 'Offre complète disponible sur jobwinner.ch.',
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });
    } catch (err: any) {
      console.warn(`[jobwinner] Erreur détail (${url}):`, err.message);
    }
  }

  return { detected: detailUrls.length, jobs: jobsFound, methodUsed: 'Cheerio HTML + Schema.org JSON-LD' };
}

// Real Scraper for jobeo (https://www.jobeo.ch)
async function scrapeJobeo(keyword = 'developpeur') {
  const searchUrl = `https://www.jobeo.ch/jobs?what=${encodeURIComponent(keyword)}`;
  const searchRes = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
    },
    timeout: 10000
  });

  const $ = cheerio.load(searchRes.data);
  const ids: string[] = [];
  $('[id*="-publication-date"]').each((_, el) => {
    const id = $(el).attr('id')?.replace('-publication-date', '');
    if (id && !ids.includes(id)) ids.push(id);
  });

  const jobsFound: any[] = [];
  for (let i = 0; i < Math.min(ids.length, 6); i++) {
    const id = ids[i];
    const detailUrl = `https://www.jobeo.ch/jobs/${id}`;
    try {
      await waitRandomDelay(500, 4000);
      const dRes = await axios.get(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });
      const $d = cheerio.load(dRes.data);
      let jobPosting: any = null;
      $d('script[type="application/ld+json"]').each((_, el) => {
        try {
          const parsed = JSON.parse($d(el).html() || '{}');
          if (parsed['@type'] === 'JobPosting') jobPosting = parsed;
        } catch (e) {}
      });

      stripDomNoise($d);

      const title = cleanHtmlText(jobPosting?.title || $d('h1').text().trim() || 'Poste Développeur');
      const company = cleanCompanyName(jobPosting?.hiringOrganization?.name || 'Entreprise en Suisse');
      const locality = jobPosting?.jobLocation?.address?.addressLocality || '';
      const region = jobPosting?.jobLocation?.address?.addressRegion || '';
      const street = jobPosting?.jobLocation?.address?.streetAddress || '';
      const location = cleanHtmlText([locality, region].filter(Boolean).join(', ') || locality || region || street || 'Suisse');
      const canton = detectSwissCanton(location + ' ' + region, title);
      const contractType = cleanHtmlText(Array.isArray(jobPosting?.employmentType) ? jobPosting.employmentType.join(', ') : (jobPosting?.employmentType || 'CDI'));
      const rawDesc = jobPosting?.description || '';
      const cleanDesc = cleanJobDescription(rawDesc);

      jobsFound.push({
        source: 'jobeo',
        external_id: `jobeo_${id}`,
        title,
        company,
        location: location || 'Suisse',
        canton,
        contract_type: contractType,
        workload: detectWorkload(title, cleanDesc),
        remote: cleanDesc.toLowerCase().includes('télétravail') || cleanDesc.toLowerCase().includes('home office') || cleanDesc.toLowerCase().includes('remote') || title.toLowerCase().includes('remote'),
        salary: null,
        published_at: jobPosting?.datePosted || new Date().toISOString(),
        discovered_at: new Date().toISOString(),
        url: detailUrl,
        description: cleanDesc || 'Offre complète disponible sur jobeo.ch.',
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });
    } catch (err: any) {
      console.warn(`[jobeo] Erreur détail (${detailUrl}):`, err.message);
    }
  }

  return { detected: ids.length, jobs: jobsFound, methodUsed: 'Cheerio HTML + Schema.org JSON-LD' };
}

// Real Scraper for LinkedIn Suisse (https://ch.linkedin.com)
async function scrapeLinkedIn(keyword = 'developpeur') {
  const searchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent('Suisse')}&start=0`;
  const searchRes = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8',
      'Referer': 'https://www.linkedin.com/jobs/search?keywords=developpeur&location=Suisse'
    },
    timeout: 12000
  });

  const $ = cheerio.load(searchRes.data);
  const rawCards: any[] = [];
  $('li').each((_, li) => {
    const card = $(li).find('.base-search-card');
    if (!card.length) return;
    const urn = card.attr('data-entity-urn') || '';
    const id = urn.replace('urn:li:jobPosting:', '').trim() || card.attr('data-id')?.trim();
    if (!id) return;
    const title = cleanHtmlText($(li).find('.base-search-card__title').text().trim() || 'Poste Développeur');
    const company = cleanCompanyName($(li).find('.base-search-card__subtitle a, .base-search-card__subtitle').text().replace(/\s+/g, ' ').trim() || 'Entreprise en Suisse');
    const location = cleanHtmlText($(li).find('.job-search-card__location').text().replace(/\s+/g, ' ').trim() || 'Suisse');
    const date = $(li).find('time').attr('datetime') || new Date().toISOString();
    const link = $(li).find('.base-card__full-link').attr('href') || `https://ch.linkedin.com/jobs/view/${id}`;
    const cleanUrl = link.split('?')[0];

    if (!rawCards.find(c => c.id === id)) {
      rawCards.push({ id, title, company, location, date, url: cleanUrl });
    }
  });

  const jobsFound: any[] = [];
  const detected = rawCards.length;

  for (let i = 0; i < Math.min(rawCards.length, 6); i++) {
    const card = rawCards[i];
    try {
      await waitRandomDelay(2000, 5000);
      const detailUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`;
      const dRes = await axios.get(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'fr-CH,fr;q=0.9,en;q=0.8'
        },
        timeout: 12000
      });

      const $d = cheerio.load(dRes.data);
      stripDomNoise($d);
      const rawDesc = $d('.show-more-less-html__markup').text().replace(/\s+/g, ' ').trim() ||
                      $d('.description__text').text().replace(/\s+/g, ' ').trim() || '';
      const cleanDesc = cleanJobDescription(rawDesc);

      const criteriaTexts: string[] = [];
      $d('.description__job-criteria-item').each((_, crit) => {
        criteriaTexts.push($d(crit).text().replace(/\s+/g, ' ').trim());
      });
      const criteriaStr = criteriaTexts.join(' | ');

      const canton = detectSwissCanton(card.location, card.title);
      const isPermanent = criteriaStr.toLowerCase().includes('temps plein') || criteriaStr.toLowerCase().includes('indéterminée') || !criteriaStr.toLowerCase().includes('temporaire');
      const contractType = isPermanent ? 'CDI' : 'Temporaire';
      const workload = detectWorkload(card.title, cleanDesc || criteriaStr);
      const isRemote = cleanDesc.toLowerCase().includes('télétravail') ||
                       cleanDesc.toLowerCase().includes('home office') ||
                       cleanDesc.toLowerCase().includes('remote') ||
                       card.title.toLowerCase().includes('remote') ||
                       card.location.toLowerCase().includes('remote');

      jobsFound.push({
        source: 'linkedin',
        external_id: `linkedin_${card.id}`,
        title: card.title,
        company: card.company,
        location: card.location || 'Suisse',
        canton,
        contract_type: contractType,
        workload,
        remote: isRemote,
        salary: null,
        published_at: card.date,
        discovered_at: new Date().toISOString(),
        url: card.url,
        description: cleanDesc || 'Description complète disponible sur LinkedIn.',
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });
    } catch (detailErr: any) {
      const isRateLimit = detailErr.response?.status === 429;
      if (isRateLimit) {
        console.warn(`[linkedin] Rate limit (429) atteint sur l'offre ${card.id}. Suspension temporaire des requêtes de détail.`);
      } else {
        console.warn(`[linkedin] Erreur détail (${card.id}):`, detailErr.message);
      }

      const canton = detectSwissCanton(card.location, card.title);
      jobsFound.push({
        source: 'linkedin',
        external_id: `linkedin_${card.id}`,
        title: card.title,
        company: card.company,
        location: card.location || 'Suisse',
        canton,
        contract_type: 'CDI',
        workload: '80% - 100%',
        remote: card.title.toLowerCase().includes('remote'),
        salary: null,
        published_at: card.date,
        discovered_at: new Date().toISOString(),
        url: card.url,
        description: `Offre publiée sur LinkedIn pour le poste de ${card.title} chez ${card.company} (${card.location}). Consultez l'annonce complète via le lien officiel.`,
        status: 'Nouvelle',
        alternate_sources: JSON.stringify([])
      });

      if (isRateLimit) {
        break;
      }

      const logs = readTable('scraping_logs');
      logs.unshift({
        id: Date.now(),
        source: 'linkedin',
        level: 'warning',
        message: `Détail partiel LinkedIn (${card.id}): ${detailErr.message}`,
        timestamp: new Date().toISOString()
      });
      await writeTable('scraping_logs', logs.slice(0, 100));
    }
  }

  return { detected, jobs: jobsFound, methodUsed: 'LinkedIn Public Guest Jobs API & Search Cards' };
}

// 3. Sources list & Scraping Trigger
router.get('/api/sources', (req, res) => {
  const sources = readTable('sources');
  const tasks = readTable('scraping_tasks') as ScrapingTask[];

  const enhancedSources = sources.map((src: any) => {
    const sourceTasks = tasks.filter(t => t.source === src.name);
    sourceTasks.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    return {
      ...src,
      current_task: sourceTasks[0] || null
    };
  });

  res.json(enhancedSources);
});

// Scraping logs endpoint
router.get('/api/logs', (req, res) => {
  res.json(readTable('scraping_logs'));
});

// Real scraping endpoint with real-time background task progress tracking
router.post('/api/sources/:name/scrape', async (req, res) => {
  const { name } = req.params;

  // Prevent double launches of the same connector
  const existingTasks = readTable('scraping_tasks') as ScrapingTask[];
  const runningTask = existingTasks.find(t => t.source === name && (t.status === 'collecting' || t.status === 'saving'));
  if (runningTask) {
    return res.status(409).json({
      success: false,
      error: `Une collecte est déjà en cours pour la source ${name}`,
      task: runningTask
    });
  }

  const startTime = new Date().toISOString();
  const taskId = `task_${name}_${Date.now()}`;
  const newTask: ScrapingTask = {
    id: taskId,
    source: name,
    status: 'collecting',
    pagesFetched: 0,
    uniqueFetched: 0,
    totalReported: null,
    newSaved: 0,
    startTime,
    elapsedSeconds: 0,
    error: null,
    message: `Démarrage de la collecte pour ${name}...`
  };

  existingTasks.unshift(newTask);
  await writeTable('scraping_tasks', existingTasks.slice(0, 50));

  res.json({
    success: true,
    taskId,
    message: `Collecte lancée pour ${name}`
  });

  // Execute collection asynchronously in the background
  (async () => {
    try {
      const profile = (readTable('user_profile')[0] || {});
      const settings = (readTable('settings')[0] || {});
      const searchQueries = buildProfileSearchQueries(profile);

      const runScraper = async (keyword: string) => {
        if (name === 'jobs_ch') return scrapeJobsCh(keyword);
        if (name === 'jobup_ch') return scrapeJobupCh(keyword);
        if (name === 'linkedin') return scrapeLinkedIn(keyword);
        if (name === 'indeed_ch') return scrapeIndeedCh(keyword);
        if (name === 'jobwinner') return scrapeJobwinner(keyword);
        if (name === 'jobeo') return scrapeJobeo(keyword);
        if (name === 'job_room') return scrapeJobRoom();
        return null;
      };

      const methodBySource: Record<string, string> = {
        jobs_ch: 'Cheerio HTML + Schema.org JSON-LD',
        jobup_ch: 'Cheerio HTML + Schema.org JSON-LD',
        linkedin: 'LinkedIn Public Guest Jobs API & Search Cards',
        indeed_ch: 'Playwright headless (Chromium) & Cheerio',
        jobwinner: 'Cheerio HTML + Schema.org JSON-LD',
        jobeo: 'Cheerio HTML + Schema.org JSON-LD',
        job_room: 'Requêtes internes du site public Job-Room (_search paginé)'
      };
      const methodUsed = methodBySource[name];
      if (!methodUsed) {
        updateTask(taskId, (t) => {
          t.status = 'error';
          t.error = `Connecteur ${name} non configuré`;
          t.message = `Erreur : Connecteur ${name} non configuré`;
        });
        return;
      }

      const result = {
        detected: 0,
        jobs: [] as any[],
        pagesFetched: 0,
        status: 'completed' as string,
        error: null as string | null,
        totalReported: null as number | null
      };
      const queryErrors: string[] = [];
      let successfulQueries = 0;

      let onlineSince: number | null = null;
      let scrapeMode: 'complète' | 'incrémentale' = 'complète';
      let windowDescription = 'Collecte complète GE/VD (sans filtre onlineSince)';

      if (name === 'job_room') {
        const sources = readTable('sources');
        const srcRecord = sources.find((s: any) => s.name === 'job_room') || {};
        const lastSuccess = srcRecord.last_successful_start_time;
        const lastFullSync = srcRecord.last_full_sync_time;
        const forceComplete = req.query.mode === 'complete';

        const nowMs = Date.now();
        const sevenDaysMs = 7 * 24 * 3600 * 1000;
        const isWeeklyFullDue = !lastFullSync || (nowMs - new Date(lastFullSync).getTime() >= sevenDaysMs);
        const hasValidResumePoint = Boolean(lastSuccess && !isNaN(new Date(lastSuccess).getTime()));

        if (!hasValidResumePoint || forceComplete || isWeeklyFullDue) {
          scrapeMode = 'complète';
          onlineSince = null;
          windowDescription = forceComplete
            ? 'Collecte complète forcée (mode=complete)'
            : (!hasValidResumePoint
                ? 'Première collecte complète GE/VD (aucun point de reprise fiable)'
                : 'Synchronisation complète hebdomadaire (>= 7 jours sans synchro complète)');
        } else {
          const lastSuccessMs = new Date(lastSuccess).getTime();
          const elapsedDays = Math.ceil((nowMs - lastSuccessMs) / (24 * 3600 * 1000));
          const requestedDays = elapsedDays + 1;

          if (requestedDays > 60) {
            scrapeMode = 'complète';
            onlineSince = null;
            windowDescription = `Collecte complète GE/VD requise (fenêtre calculée de ${requestedDays} jours > plafond de 60 jours)`;
          } else {
            scrapeMode = 'incrémentale';
            onlineSince = Math.max(1, Math.min(60, requestedDays));
            windowDescription = `Collecte incrémentale de ${onlineSince} jour(s) entiers (~${onlineSince * 24}h avec 1j de recouvrement, fenêtre approximative)`;
          }
        }

        updateTask(taskId, (t) => {
          t.message = `[Mode: ${scrapeMode}${onlineSince ? ` | ${onlineSince} jour(s)` : ''}] Fenêtre : ${windowDescription} | Lancement de la collecte Job-Room...`;
        });

        const maxPagesReq = req.query.max_pages ? Number(req.query.max_pages) : undefined;
        let testUrl: string | undefined = undefined;
        const isTestEnv = process.env.NODE_ENV === 'test' ||
                          process.env.JOBPILOT_TEST_MODE === '1' ||
                          Boolean(process.env.JOBPILOT_JOBROOM_TEST_URL);
        if (isTestEnv && process.env.JOBPILOT_JOBROOM_TEST_URL) {
          testUrl = process.env.JOBPILOT_JOBROOM_TEST_URL;
        }

        const jrResult = await scrapeJobRoom({
          maxPages: maxPagesReq,
          onlineSince,
          testUrl,
          delayMinMs: testUrl ? 0 : 1500,
          delayMaxMs: testUrl ? 0 : 5000,
          onPageFetched: (page, itemsCount, detectedTotal, uniqueDetected, totalReported) => {
            updateTask(taskId, (t) => {
              t.pagesFetched = page + 1;
              t.uniqueFetched = uniqueDetected;
              t.totalReported = totalReported;
              t.message = `[Mode: ${scrapeMode}${onlineSince ? ` | ${onlineSince} jour(s)` : ''}] Page ${page + 1} : ${uniqueDetected} uniques détectées sur ${detectedTotal} traitées (Total annoncé : ${totalReported ?? 'non précisé'})...`;
            });
          }
        });
        result.detected = jrResult.detected;
        result.jobs = jrResult.jobs;
        result.pagesFetched = jrResult.pagesFetched;
        result.status = jrResult.status;
        result.error = jrResult.error;
        result.totalReported = jrResult.totalReported;
        successfulQueries = jrResult.status === 'error' ? 0 : 1;
        if (jrResult.error) {
          queryErrors.push(`job_room (${jrResult.status}): ${jrResult.error}`);
        }
      } else {
        for (let qIdx = 0; qIdx < searchQueries.length; qIdx++) {
          const keyword = searchQueries[qIdx];
          try {
            const queryResult = await runScraper(keyword);
            if (!queryResult) continue;
            result.detected += queryResult.detected;
            result.jobs.push(...queryResult.jobs);
            successfulQueries++;

            updateTask(taskId, (t) => {
              t.pagesFetched = successfulQueries;
              t.uniqueFetched = result.jobs.length;
              t.message = `Recherche "${keyword}" (${successfulQueries}/${searchQueries.length}) : ${result.jobs.length} annonces récupérées...`;
            });
          } catch (queryError: any) {
            queryErrors.push(`"${keyword}": ${queryError?.message || 'erreur inconnue'}`);
          }
        }
        if (successfulQueries === 0) {
          throw new Error(`Toutes les recherches ont échoué : ${queryErrors.join(' ; ')}`);
        }
      }

      if (result.status === 'error') {
        updateTask(taskId, (t) => {
          t.status = 'error';
          t.error = result.error || 'Erreur lors de la collecte';
          t.message = `Erreur [Mode: ${scrapeMode}] : ${t.error}`;
        });

        const sources = readTable('sources');
        const sIndex = sources.findIndex((s: any) => s.name === name);
        if (sIndex !== -1) {
          sources[sIndex].last_run = startTime;
          sources[sIndex].status = 'erreur';
          sources[sIndex].error_message = result.error || 'Erreur lors de la collecte';
          sources[sIndex].mode = scrapeMode;
          sources[sIndex].window_queried = windowDescription;
          await writeTable('sources', sources);
        }
        return;
      }

      // Saving phase
      updateTask(taskId, (t) => {
        t.status = 'saving';
        t.message = `Enregistrement des offres récupérées en base...`;
      });

      let newSavedCount = 0;
      const mutateJobsRes = await mutateTable('jobs', (currentJobs) => {
        const updatedList = [...currentJobs];
        newSavedCount = 0;

        for (const newJob of result.jobs) {
          if (newJob.url) {
            newJob.url = normalizeJobUrl(newJob.url) || newJob.url;
          }
          const existingByUrl = updatedList.find(
            (j: any) => (newJob.url && normalizeJobUrl(j.url) === newJob.url) ||
                        (newJob.external_id && j.external_id && j.external_id === newJob.external_id)
          );
          if (existingByUrl) {
            if ((!existingByUrl.description || existingByUrl.description.length < 150) && newJob.description && newJob.description.length > 200) {
              existingByUrl.description = newJob.description;
            }
            continue;
          }

          const normTitle = (newJob.title || '').toLowerCase().trim();
          const normCompany = (newJob.company || '').toLowerCase().trim();
          const normLoc = (newJob.location || '').toLowerCase().trim();
          const existingByDetails = (normCompany && (normLoc || newJob.canton)) ? updatedList.find((j: any) =>
            (j.title || '').toLowerCase().trim() === normTitle &&
            (j.company || '').toLowerCase().trim() === normCompany &&
            ((j.location || '').toLowerCase().trim() === normLoc || (j.canton && j.canton === newJob.canton))
          ) : null;

          if (existingByDetails) {
            let alts: string[] = [];
            try {
              alts = typeof existingByDetails.alternate_sources === 'string'
                ? JSON.parse(existingByDetails.alternate_sources)
                : (existingByDetails.alternate_sources || []);
            } catch (e) { alts = []; }
            if (newJob.source && !alts.includes(newJob.source)) {
              alts.push(newJob.source);
              existingByDetails.alternate_sources = JSON.stringify(alts);
            }
            if ((!existingByDetails.description || existingByDetails.description.length < 150) && newJob.description && newJob.description.length > 200) {
              existingByDetails.description = newJob.description;
            }
            if (!existingByDetails.workload && newJob.workload) {
              existingByDetails.workload = newJob.workload;
            }
            continue;
          }

          const jobToSave = { ...newJob };
          jobToSave.score = calculateJobScore(jobToSave, profile, settings);
          jobToSave.id = Date.now() + Math.floor(Math.random() * 1000000);
          jobToSave.is_new = 1;
          updatedList.unshift(jobToSave);
          newSavedCount++;
        }

        return updatedList;
      });

      const isComplete = result.status === 'completed';
      const saveSucceeded = mutateJobsRes.success;
      const finalStatus = (isComplete && saveSucceeded) ? 'completed' : 'partial';

      updateTask(taskId, (t) => {
        t.status = saveSucceeded ? finalStatus : 'error';
        t.newSaved = newSavedCount;
        t.uniqueFetched = result.jobs.length;
        t.pagesFetched = result.pagesFetched || successfulQueries || 1;
        t.message = (isComplete && saveSucceeded)
          ? `Bilan [Mode: ${scrapeMode}${onlineSince ? ` | ~${onlineSince}j` : ''}] : Collecte terminée. Fenêtre: ${windowDescription}. ${result.jobs.length} annonces uniques (${newSavedCount} nouvelles enregistrées, ${result.detected} vues). Note : fenêtre approximative en jours entiers, sans garantie d'horodatage strict à 24h ni de couverture des modifications rétrospectives.`
          : `Bilan [Mode: ${scrapeMode}${onlineSince ? ` | ~${onlineSince}j` : ''}] : Collecte ${result.status} / Sauvegarde ${saveSucceeded ? 'OK' : 'ÉCHEC'}. Fenêtre: ${windowDescription}. ${result.jobs.length} annonces, ${newSavedCount} nouvelles. Point de reprise NON avancé.`;
      });

      // Update sources
      const sources = readTable('sources');
      const sIndex = sources.findIndex((s: any) => s.name === name);
      if (sIndex !== -1) {
        sources[sIndex].last_run = startTime;
        sources[sIndex].found_count += result.jobs.length;
        sources[sIndex].new_count += newSavedCount;
        sources[sIndex].status = (isComplete && saveSucceeded) ? 'actif' : 'partiel';
        sources[sIndex].error_message = (isComplete && saveSucceeded) ? null : (result.error || (!saveSucceeded ? 'Échec de sauvegarde' : `Collecte non exhaustive (${result.status})`));
        sources[sIndex].mode = scrapeMode;
        sources[sIndex].window_queried = windowDescription;

        if (name === 'job_room' && isComplete && saveSucceeded) {
          sources[sIndex].last_successful_start_time = startTime;
          if (scrapeMode === 'complète') {
            sources[sIndex].last_full_sync_time = startTime;
          }
        }

        await writeTable('sources', sources);
      }

      // Scraping logs
      const logs = readTable('scraping_logs');
      logs.unshift({
        id: Date.now(),
        source: name,
        level: (isComplete && saveSucceeded) ? 'info' : 'warning',
        message: `Scraping ${name} [Mode: ${scrapeMode}${onlineSince ? ` | ~${onlineSince}j` : ''}] : Fenêtre [${windowDescription}] - ${result.jobs.length} uniques, ${newSavedCount} nouvelles (statut : ${result.status}, sauvegarde: ${saveSucceeded ? 'OK' : 'ÉCHEC'})`,
        timestamp: startTime
      });
      await writeTable('scraping_logs', logs.slice(0, 100));

    } catch (bgErr: any) {
      console.error(`Background scraping error for ${name}:`, bgErr);
      updateTask(taskId, (t) => {
        t.status = 'error';
        t.error = bgErr.message;
        t.message = `Erreur : ${bgErr.message}`;
      });

      const sources = readTable('sources');
      const sIndex = sources.findIndex((s: any) => s.name === name);
      if (sIndex !== -1) {
        sources[sIndex].last_run = startTime;
        sources[sIndex].error_message = bgErr.message;
        sources[sIndex].status = 'erreur';
        await writeTable('sources', sources);
      }
    }
  })();
});

export default router;
