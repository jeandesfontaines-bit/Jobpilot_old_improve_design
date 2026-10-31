const { chromium } = require('playwright');

async function inspectProspectiveFrames() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://ohws.prospective.ch/public/v1/jobs/3f0fc32e-ce24-4019-92e0-daf8fe3df8be', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  for (const [i, frame] of page.frames().entries()) {
    console.log(`\n--- FRAME [${i}] URL: ${frame.url()} ---`);
    try {
      const inputs = await frame.$$eval('input, select, textarea, button, a', els =>
        els.map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder, text: el.textContent?.trim().slice(0, 50) }))
      );
      console.log(inputs);
    } catch (e) {
      console.log('Error evaluating frame:', e.message);
    }
  }

  await browser.close();
}

inspectProspectiveFrames().catch(console.error);
