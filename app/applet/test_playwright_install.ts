import { chromium } from 'playwright';

async function testPlaywright() {
  console.log('Testing Playwright & Chromium...');
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://example.com');
    const title = await page.title();
    console.log('Playwright successfully loaded page:', title);
    await browser.close();
    console.log('Playwright test PASSED successfully.');
  } catch (err) {
    console.error('Playwright test FAILED:', err);
    process.exit(1);
  }
}

testPlaywright();
