import fs from 'fs';
import path from 'path';
import { chromium, Page } from 'playwright';

export interface AutomationResult {
  status: 'sent' | 'requires_review' | 'captcha' | 'missing_field' | 'error' | 'unrecognized_form';
  message: string;
  details?: {
    actionLogs: string[];
    confirmationVerified: boolean;
  };
}

async function handleCookieBanner(page: Page, actionLogs: string[]): Promise<void> {
  const cookieSelectors = [
    'button:has-text("Accepter")', 'button:has-text("Tout accepter")',
    'button:has-text("J\'accepte")', 'button:has-text("OK")', 'button:has-text("Consent")',
    'button:has-text("Accept")', 'button:has-text("Accept all")',
    'a:has-text("Accepter")', 'a:has-text("Tout accepter")'
  ];
  
  for (const sel of cookieSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      actionLogs.push(`Cookie banner button found: ${sel}. Clicking...`);
      await btn.click();
      await page.waitForTimeout(1000);
      return;
    }
  }
}

async function solveMathCaptcha(page: Page, actionLogs: string[]): Promise<boolean> {
  // Look for math elements (e.g., text like "3 + 4 =" or "Combien font")
  const equationEl = await page.$('text=/(\\d+)\\s*[\\+\\-\\*\\/]\\s*(\\d+)\\s*=?/');
  if (equationEl) {
    const text = await equationEl.textContent();
    const match = text?.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
    if (match) {
      const [_, num1, op, num2] = match;
      let result = 0;
      switch (op) {
        case '+': result = parseInt(num1) + parseInt(num2); break;
        case '-': result = parseInt(num1) - parseInt(num2); break;
        case '*': result = parseInt(num1) * parseInt(num2); break;
        case '/': result = parseInt(num1) / parseInt(num2); break;
      }
      
      // Look for a nearby input
      const input = await page.$('input[type="text"]:near(text=/(\\d+)/, 50)');
      if (input) {
        await input.fill(result.toString());
        actionLogs.push(`Solved math captcha: ${text} = ${result}`);
        return true;
      }
    }
  }
  return false;
}

function isVisualCaptcha(content: string): boolean {
  // Only stop for visual/complex CAPTCHAs that need user intervention
  return content.includes('iframe') && (content.includes('recaptcha') || content.includes('hcaptcha') || content.includes('turnstile'));
}

export async function runMultipagePlaywrightApplication(
  job: any,
  profile: any,
  settings: any
): Promise<AutomationResult> {
  const targetUrl = job.url;
  const actionLogs: string[] = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    actionLogs.push(`Navigating to start: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    await handleCookieBanner(page, actionLogs);

    // Step-by-step logic
    let pageCount = 0;
    while (pageCount < 10) { // Safety limit
      pageCount++;
      await page.waitForLoadState('networkidle');
      const screenshotsDir = process.env.JOBPILOT_SCREENSHOTS_DIR || path.join(process.cwd(), 'data', 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      const screenshotPath = path.join(screenshotsDir, `step_${pageCount}.png`);
      await page.screenshot({ path: screenshotPath });
      actionLogs.push(`Step ${pageCount}: Screenshot saved at ${screenshotPath}`);

      const content = await page.content();
      
      // Handle math captcha automatically
      if (await solveMathCaptcha(page, actionLogs)) {
        await page.waitForTimeout(1000);
        continue;
      }

      // Stop only for visual captcha
      if (isVisualCaptcha(content)) {
        await browser.close();
        return { status: 'captcha', message: 'CAPTCHA visuel nécessitant intervention détecté.', details: { actionLogs, confirmationVerified: false } };
      }

      // Check for success
      if (content.toLowerCase().includes('merci') || content.toLowerCase().includes('succès') || content.toLowerCase().includes('erfolgreich')) {
        await browser.close();
        return { status: 'sent', message: 'Confirmation réelle détectée.', details: { actionLogs, confirmationVerified: true } };
      }

      // Find fields
      const fields = await page.$$('input:visible, select:visible, textarea:visible');
      for (const field of fields) {
        const name = await field.getAttribute('name') || await field.getAttribute('id');
        if (name && profile[name]) {
          await field.fill(profile[name]);
          actionLogs.push(`Filled ${name} with ${profile[name]}`);
        }
      }

      // Find action button
      const nextBtn = await page.$('button:has-text("Continuer"), button:has-text("Suivant"), button:has-text("Envoyer"), button:has-text("Postuler"), button:has-text("Bewerben")');
      if (nextBtn) {
        actionLogs.push(`Clicking button: ${await nextBtn.textContent()}`);
        await nextBtn.click();
        await page.waitForTimeout(2000); // Wait for page transition
      } else {
        break;
      }
    }

    await browser.close();
    return { status: 'requires_review', message: 'Parcours terminé sans confirmation explicite.', details: { actionLogs, confirmationVerified: false } };
  } catch (err: any) {
    return { status: 'error', message: err.message, details: { actionLogs, confirmationVerified: false } };
  }
}
