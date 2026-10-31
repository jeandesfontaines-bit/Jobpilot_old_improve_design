const { chromium } = require('playwright');

async function inspectProspectiveHtml() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://ohws.prospective.ch/public/v1/jobs/3f0fc32e-ce24-4019-92e0-daf8fe3df8be', { waitUntil: 'networkidle' });
  
  const content = await page.content();
  console.log('--- HTML CONTENT LENGTH ---', content.length);
  console.log('--- BODY SNIPPET ---', content.slice(0, 1000));

  const frames = page.frames();
  console.log('--- FRAMES ---', frames.length);
  for (const f of frames) {
    console.log('Frame URL:', f.url());
  }

  await browser.close();
}

inspectProspectiveHtml().catch(console.error);
