import { chromium } from 'playwright';

export async function scrapeJobs(source: 'jobs_ch' | 'jobup_ch', query: string = 'developpeur') {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  
  try {
    if (source === 'jobs_ch') {
      await page.goto(`https://www.jobs.ch/fr/offres-d-emploi/?term=${query}`);
      await page.waitForSelector('[data-qa="vacancy-list-item"]', { timeout: 10000 });
      
      const jobCards = await page.$$('[data-qa="vacancy-list-item"]');
      for (const card of jobCards.slice(0, 3)) {
        const title = await card.$eval('[data-qa="vacancy-title"]', (el) => el.textContent?.trim() || '');
        const company = await card.$eval('[data-qa="vacancy-company"]', (el) => el.textContent?.trim() || '');
        const url = 'https://www.jobs.ch' + await card.$eval('a', (el) => el.getAttribute('href') || '');
        
        results.push({ title, company, url, source: 'jobs_ch' });
      }
    } else {
      await page.goto(`https://www.jobup.ch/fr/emplois/?keywords=${query}`);
      await page.waitForSelector('.job-item', { timeout: 10000 });
      
      const jobCards = await page.$$('.job-item');
      for (const card of jobCards.slice(0, 3)) {
        const title = await card.$eval('h2', (el) => el.textContent?.trim() || '');
        const company = await card.$eval('.company-name', (el) => el.textContent?.trim() || '');
        const url = await card.$eval('a', (el) => el.getAttribute('href') || '');
        
        results.push({ title, company, url, source: 'jobup_ch' });
      }
    }
  } catch (e) {
    console.error(`Error scraping ${source}:`, e);
  } finally {
    await browser.close();
  }
  return results;
}
