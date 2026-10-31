import fs from 'fs';
import path from 'path';
import { evaluateJobFilters } from '../src/services/jobFilterEngine.ts';

const profilePath = path.join(process.cwd(), 'data', 'user_profile.json');
const jobsPath = path.join(process.cwd(), 'data', 'jobs.json');

const rawProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
const allJobs: any[] = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'));

// Sélection de 10 offres représentatives et variées :
// - Métiers correspondants (Account Executive, Key Account Manager, Sales B2B...)
// - Métiers non correspondants (Cuisinier, Peintre, Dessinateur, etc.)
// - Cantons autorisés (GE, VD), canton exclu ou autre canton (ZH, BE), canton inconnu
const targetJobIds = [
  1792365167641, // Cuisinier·ère en diététique (VD)
  1792092892467, // Business Development Manager (Undersales Sàrl, GE)
  1792092824723, // Key Account Manager (Vokus Personal AG, VD)
  1792365371394, // Technicien de maintenance (Ficoba SA, VD)
  1792365619562, // Physiothérapeute (Spotted, VD)
  1792364880992, // FX Business Developer FR / ENG 100% (Michael Page, GE)
  1792365444457, // Dessinateur·trice en bâtiment (Iraci Angelo Architectes SA, GE)
  1792365255635, // Programmeur Régleur CNC (Proman, VD)
  1792365383023, // Recherchons un / une peintre en bâtiment à 100% (VD)
  1792365037713  // Brokerbetreuer/in 100% (VAUDOISE ASSURANCES, VD)
];

const selectedJobs = targetJobIds.map(id => allJobs.find(j => j.id === id)).filter(Boolean);

console.log('=== SIMULATION SUR 10 OFFRES VARIÉES DE DATA/JOBS.JSON ===\n');

const results = selectedJobs.map((job, idx) => {
  const evalResult = evaluateJobFilters(job, profile);
  const status = evalResult.isExcluded ? 'Exclue' : 'Simulé (Éligible)';
  const reason = evalResult.isExcluded 
    ? evalResult.reasons.join(' | ') 
    : `Retenue (Pertinence: ${evalResult.relevance?.matchedRole ? `rôle « ${evalResult.relevance.matchedRole} »` : `compétences [${(evalResult.relevance?.matchedSkills || []).join(', ')}]`}, Canton: ${job.canton || 'Inconnu'})`;

  return {
    index: idx + 1,
    id: job.id,
    title: job.title.length > 50 ? job.title.slice(0, 47) + '...' : job.title,
    company: job.company,
    canton: job.canton || 'Inconnu',
    status,
    reason
  };
});

for (const r of results) {
  console.log(`[${r.index}/10] [${r.status}]`);
  console.log(`  Titre     : ${r.title}`);
  console.log(`  Entreprise: ${r.company}`);
  console.log(`  Canton    : ${r.canton}`);
  console.log(`  Motif     : ${r.reason}\n`);
}
