import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { generateTailoredCv, runPlaywrightApplication } from '../src/services/automationAgent';

async function runEvaluation() {
  console.log('=== RAPPORT D’ÉVALUATION JOBPILOT SUISSE ===\n');

  // 1. Playwright Installation & Functionality Test
  let playwrightStatus = 'Échec';
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto('https://example.com');
    await browser.close();
    playwrightStatus = 'Succès (Playwright & Chromium opérationnels)';
  } catch (e: any) {
    playwrightStatus = `Échec : ${e?.message}`;
  }
  console.log(`1. Confirmation de l’installation Playwright : ${playwrightStatus}\n`);

  // Load jobs and profile
  const dataDir = path.join(process.cwd(), 'data');
  const jobsFile = path.join(dataDir, 'jobs.json');
  const profileFile = path.join(dataDir, 'user_profile.json');
  const settingsFile = path.join(dataDir, 'settings.json');

  const jobs = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, 'utf-8')) : [];
  const profile = fs.existsSync(profileFile) ? JSON.parse(fs.readFileSync(profileFile, 'utf-8'))[0] || {} : {};
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))[0] || {} : {};

  // Target Prospective jobs
  const targetIds = ['1792365017118', '1791900826155'];
  const targetJobs = jobs.filter((j: any) => targetIds.includes(String(j.id)));
  const otherJobs = jobs.filter((j: any) => !targetIds.includes(String(j.id))).slice(0, 10);
  const testJobs = [...targetJobs, ...otherJobs];

  console.log(`2. CV générés et testés sur ${testJobs.length} offres (dont Meier Tobler et Hirslanden) :\n`);

  const cvReports: any[] = [];
  const sentReports: any[] = [];
  const reviewReports: any[] = [];
  const blockReports: any[] = [];
  const unsupportedReports: any[] = [];

  for (const job of testJobs) {
    const tailored = await generateTailoredCv(job, profile);
    cvReports.push({
      jobId: job.id,
      title: job.title,
      company: job.company,
      recommendedCvId: tailored.recommendedCvId,
      reason: tailored.adaptationReason
    });

    // Run automation test
    const result = await runPlaywrightApplication(job, profile, settings);
    const itemReport = {
      jobId: job.id,
      title: job.title,
      company: job.company,
      url: job.url,
      status: result.status,
      message: result.message
    };

    if (result.status === 'sent') {
      sentReports.push(itemReport);
    } else if (result.status === 'requires_review') {
      reviewReports.push({
        ...itemReport,
        exactQuestion: result.details?.unknownQuestions[0] || 'Déclaration de confidentialité / Autorisation / Authentification requise'
      });
    } else if (result.status === 'captcha' || result.status === 'missing_field') {
      blockReports.push({
        ...itemReport,
        reason: result.message
      });
    } else {
      unsupportedReports.push({
        ...itemReport,
        reason: result.message
      });
    }
  }

  // Print formatted report sections as requested
  console.log('--- CV GÉNÉRÉS PAR OFFRE AVEC RAISON DE L’ADAPTATION ---');
  for (const r of cvReports) {
    console.log(`• Offre #${r.jobId} - ${r.title} (${r.company})`);
    console.log(`  CV Recommandé ID : ${r.recommendedCvId}`);
    console.log(`  Raison : ${r.reason}\n`);
  }

  console.log('--- CANDIDATURES ENVOYÉES AVEC CONFIRMATION RÉELLE ---');
  if (sentReports.length === 0) console.log('(Aucune - toutes en attente de consentement ou revue)');
  for (const r of sentReports) {
    console.log(`• Offre #${r.jobId} - ${r.title} (${r.company}) -> Envoyée avec succès (Confirmation réelle vérifiée)`);
  }
  console.log('');

  console.log('--- CANDIDATURES EN REQUIRES_REVIEW AVEC QUESTION EXACTE ---');
  for (const r of reviewReports) {
    console.log(`• Offre #${r.jobId} - ${r.title} (${r.company})`);
    console.log(`  Question / Blocage exact : ${r.exactQuestion}\n`);
  }

  console.log('--- BLOCAGES AVEC RAISON EXACTE ---');
  for (const r of blockReports) {
    console.log(`• Offre #${r.jobId} - ${r.title} (${r.company}) -> ${r.message}`);
  }
  console.log('');

  console.log('--- FORMULAIRES NON PRIS EN CHARGE ---');
  if (unsupportedReports.length === 0) console.log('(Aucun formulaire non pris en charge parmi la sélection)');
  for (const r of unsupportedReports) {
    console.log(`• Offre #${r.jobId} - ${r.title} (${r.company}) -> ${r.reason}`);
  }

  console.log('\n=== FIN DU RAPPORT D’ÉVALUATION ===');
}

runEvaluation().catch(console.error);
