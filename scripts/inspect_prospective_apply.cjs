const { chromium } = require('playwright');

async function checkApply() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://ohws.prospective.ch/public/v1/jobs/3f0fc32e-ce24-4019-92e0-daf8fe3df8be', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const applyBtn = await page.$('a:has-text("Candidature en ligne"), button:has-text("Candidature en ligne"), button:has-text("Postuler"), button:has-text("Bewerben")');
  console.log('Apply button found:', !!applyBtn);
  if (applyBtn) {
    const text = await applyBtn.textContent();
    console.log('Apply button text:', text);
    const href = await applyBtn.getAttribute('href');
    console.log('Apply button href:', href);
    if (href) {
      await page.goto(href.startsWith('http') ? href : new URL(href, page.url()).href);
    } else {
      await applyBtn.click();
    }
    await page.waitForTimeout(3000);

    const inputs = await page.$$eval('input, select, textarea, button', els =>
      els.map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, label: el.getAttribute('aria-label') }))
    );
    console.log('Form inputs / elements:', inputs);
  }

  await browser.close();
}

checkApply().catch(console.error);
