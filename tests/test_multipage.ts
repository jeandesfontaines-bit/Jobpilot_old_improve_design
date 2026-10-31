import fs from 'fs';
import path from 'path';
import { runMultipagePlaywrightApplication } from '../src/services/multipageAutomation';

async function testMeierTobler() {
  const jobs = JSON.parse(fs.readFileSync('data/jobs.json', 'utf-8'));
  const profile = JSON.parse(fs.readFileSync('data/user_profile.json', 'utf-8'))[0];
  const settings = JSON.parse(fs.readFileSync('data/settings.json', 'utf-8'))[0];
  const job = jobs.find((j: any) => j.id === 1792365017118);

  console.log('Testing Meier Tobler...');
  const result = await runMultipagePlaywrightApplication(job, profile, settings);
  console.log('Result:', JSON.stringify(result, null, 2));
}

testMeierTobler().catch(console.error);
