const { chromium } = require('playwright');

async function inspectProspectiveForm() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://ohws.prospective.ch/public/v1/jobs/3f0fc32e-ce24-4019-92e0-daf8fe3df8be', { waitUntil: 'domcontentloaded' });
  
  const inputs = await page.$$eval('input, select, textarea, button', elements => 
    elements.map(el => ({
      tagName: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.getAttribute('id'),
      placeholder: el.getAttribute('placeholder'),
      className: el.getAttribute('class'),
      text: el.textContent?.trim() || el.getAttribute('value')
    }))
  );

  console.log('--- PROSPECTIVE FORM ELEMENTS ---');
  console.log(JSON.stringify(inputs, null, 2));
  await browser.close();
}

inspectProspectiveForm().catch(console.error);
