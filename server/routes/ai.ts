/**
 * Routes IA — Génération ciblée de lettre de motivation pour postuler.
 * Utilise Ollama Cloud avec rotation automatique pour produire des candidatures
 * sur-mesure, directes et adaptées au marché suisse.
 */
import { Router } from 'express';
import { readTable } from '../db.ts';
import { ollamaCloud } from '../../src/services/ollamaCloudClient.ts';
import {
  formatProfileExperiences,
  formatProfileFormations
} from '../../src/services/swissJobHelpers.ts';
import { generateTailoredLetter } from '../../src/services/autonomousPipeline.ts';

const router = Router();

// Endpoint IA unique : Génération de lettre de motivation ciblée pour postuler
router.post('/api/ai/action', async (req, res) => {
  const { action, job_id } = req.body;
  const jobs = readTable('jobs');
  const job = jobs.find((j: any) => String(j.id) === String(job_id));
  if (!job) return res.status(404).json({ error: 'Offre non trouvée' });

  const profile = readTable('user_profile')[0] || {};
  const settings = readTable('settings')[0] || {};

  // Prompt optimisé pour le marché de l'emploi en Suisse
  const prompt = `Tu es un expert en recrutement et en candidatures sur le marché de l'emploi en Suisse (Suisse romande & alémanique).
Rédige une lettre de motivation professionnelle, directe et percutante pour postuler à cette offre d'emploi.

PROFIL DU CANDIDAT :
- Prénom & Nom : ${profile.first_name || ''} ${profile.last_name || ''}
- Résidence : ${profile.city || ''} (Canton : ${profile.canton || 'GE'})
- Rôles ciblés : ${(profile.wanted_roles || []).join(', ')}
- Compétences clés : ${(profile.skills || []).join(', ')}
- Expériences professionnelles réelles :
${formatProfileExperiences(profile.experiences) || 'Non spécifiées'}
- Formations :
${formatProfileFormations(profile.formations || profile.diplomas) || 'Non spécifiées'}
- Langues : ${profile.languages || 'Français, Anglais'}
- Permis de travail en Suisse : ${profile.swiss_permit || 'Non spécifié'}

OFFRE D'EMPLOI :
- Titre du poste : ${job.title}
- Entreprise : ${job.company}
- Lieu : ${job.location || 'Suisse'} (Canton : ${job.canton || ''})
- Contrat : ${job.contract_type || 'CDI'} | Taux : ${job.workload || '100%'}
- Description de l'offre :
${(job.description || '').substring(0, 3500)}

CONSIGNES STRICTES DE RÉDACTION :
1. Adopte un ton suisse professionnel, direct, humble mais confiant, sans flatterie excessive ni formules pompeuses.
2. Structure claire en 3-4 paragraphes :
   - Paragraphe 1 : L'accroche directe mentionnant le poste et ce qui motive la candidature pour ${job.company}.
   - Paragraphe 2 : Adéquation concrète avec les besoins de l'offre (faits vérifiables, compétences et réalisations du profil).
   - Paragraphe 3 : Valeur ajoutée opérationnelle immédiate pour l'équipe en Suisse.
   - Paragraphe 4 : Disponibilité pour un échange et formule de politesse soignée.
3. Si le permis de travail suisse est renseigné (${profile.swiss_permit || 'non spécifié'}), mentionne brièvement l'éligibilité légale immédiate (ex: permis C, B, G ou citoyenneté).
4. N'invente AUCUNE expérience ou compétence absente du profil candidat.
5. Rédige en français impeccable.`;

  // 1. Appel obligatoire au Cluster Ollama Cloud (aucun appel local)
  try {
    const aiRes = await ollamaCloud.generate(prompt, settings.ollama_model);
    return res.json({
      result: aiRes.text,
      engine: 'ollama_cloud',
      model: aiRes.model
    });
  } catch (cloudErr: any) {
    console.warn('[Ollama Cloud] Échec du cluster pour la lettre :', cloudErr.message);
  }

  // 2. Repli déterministe basé sur le profil réel
  const letter = generateTailoredLetter(job, profile);
  return res.json({ result: letter, engine: 'local_fallback' });
});

export default router;
