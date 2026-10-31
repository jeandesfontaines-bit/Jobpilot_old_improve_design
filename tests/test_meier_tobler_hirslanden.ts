import fs from 'fs';
import path from 'path';
import { generateTailoredCv, runPlaywrightApplication } from '../src/services/automationAgent';

async function testTargetOffers() {
  console.log('=== RAPPORT D’ÉVALUATION PLAYWRIGHT - MEIER TOBLER ET HIRSLANDEN ===\n');

  const dataDir = path.join(process.cwd(), 'data');
  const jobsFile = path.join(dataDir, 'jobs.json');
  const profileFile = path.join(dataDir, 'user_profile.json');
  const settingsFile = path.join(dataDir, 'settings.json');

  const jobs = fs.existsSync(jobsFile) ? JSON.parse(fs.readFileSync(jobsFile, 'utf-8')) : [];
  const profile = fs.existsSync(profileFile) ? JSON.parse(fs.readFileSync(profileFile, 'utf-8'))[0] || {} : {};
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))[0] || {} : {};

  // Target Meier Tobler and Hirslanden job IDs
  const targetIds = ['1792365017118', '1791900826155'];
  const targetJobs = jobs.filter((j: any) => targetIds.includes(String(j.id)));

  for (const job of targetJobs) {
    console.log(`--------------------------------------------------`);
    console.log(`Offre #${job.id} : ${job.title}`);
    console.log(`Entreprise : ${job.company}`);
    console.log(`URL : ${job.url}`);

    // Generate tailored CV
    const tailored = await generateTailoredCv(job, profile);
    console.log(`\n[CV Recommandé] ID: ${tailored.recommendedCvId}`);
    console.log(`[Raison d'adaptation] ${tailored.adaptationReason}`);

    console.log(`\n[Exécution Playwright (headless: false)]...`);
    const result = await runPlaywrightApplication(job, profile, settings, { headless: false });

    console.log(`\n[Résultat Observé]`);
    console.log(`  Statut : ${result.status}`);
    console.log(`  Message : ${result.message}`);
    console.log(`  Confirmation vérifiée : ${result.details?.confirmationVerified ? 'OUI (Preuve observée)' : 'NON (Pas de confirmation explicite)'}`);
    console.log(`  URL finale / Preuve : ${result.details?.proofUrl || 'N/A'}`);
    
    console.log(`\n[Sélecteurs utilisés & Actions réellement effectuées] :`);
    if (result.details?.actionLogs && result.details.actionLogs.length > 0) {
      for (const log of result.details.actionLogs) {
        console.log(`  • ${log}`);
      }
    } else {
      console.log(`  (Aucun log d'action enregistré)`);
    }
    console.log(`\nChamps remplis : ${(result.details?.fieldsFilled || []).join(', ') || 'Aucun'}`);
    console.log(`Champs manquants : ${(result.details?.missingFields || []).join(', ') || 'Aucun'}`);
    console.log('\n');
  }

  console.log('=== FIN DU RAPPORT CIBLÉ ===');
}

testTargetOffers().catch(console.error);
