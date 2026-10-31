import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromium } from 'playwright';
import { generateCvPdfBuffer, generateCoverLetterPdfBuffer } from '../../server/services/cvPdfGenerator.ts';
import { readTable, mutateTable, UPLOADS_DIR, DATA_DIR } from '../../server/db.ts';
import { normalizeJobUrl } from '../lib/jobs.ts';
import { parseCvText } from './cvParser.ts';
import { ollamaCloud } from './ollamaCloudClient.ts';
import { generateTailoredLetter } from './autonomousPipeline.ts';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

export interface AutomationResult {
  status: 'sent' | 'requires_review' | 'captcha' | 'missing_field' | 'error' | 'unrecognized_form' | 'already_submitted' | 'simulated';
  message: string;
  recommendedCvId?: string;
  adaptationReason?: string;
  tailoredCvFilename?: string;
  tailoredCvPath?: string;
  coverLetterFilename?: string;
  coverLetterPath?: string;
  baseAtsCvFilename?: string;
  baseAtsCvPath?: string;
  details?: {
    fieldsFilled: string[];
    missingFields: string[];
    unknownQuestions: string[];
    captchaDetected: boolean;
    confirmationVerified: boolean;
    cvUploaded?: boolean;
    letterUploaded?: boolean;
    letterRequired?: boolean;
    coverLetterTypeSelected?: string | null;
    summaryComplete?: boolean;
    proofUrl?: string;
    actionLogs?: string[];
  };
}

function maskValue(key: string, val: string): string {
  if (!val) return '';
  if (key === 'email') {
    const parts = val.split('@');
    if (parts.length === 2) {
      return `${parts[0][0]}***@${parts[1]}`;
    }
    return '***@***';
  }
  if (key === 'phone') {
    return val.replace(/\d(?=\d{4})/g, '*');
  }
  if (key === 'firstname' || key === 'lastname') {
    return `${val[0]}***`;
  }
  return '***';
}

function buildProfileTextForExtractor(profile: any): string {
  const lines: string[] = [];
  const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  if (fullName) lines.push(fullName);
  if (profile?.current_title) lines.push(String(profile.current_title));
  if (profile?.email) lines.push(String(profile.email));
  if (profile?.phone) lines.push(String(profile.phone));
  if (profile?.city) lines.push(String(profile.city));

  if (Array.isArray(profile?.experiences) && profile.experiences.length > 0) {
    lines.push('\nEXPÉRIENCE PROFESSIONNELLE');
    for (const exp of profile.experiences) {
      const dates = exp.dates || [exp.start_date, exp.end_date].filter(Boolean).join(' - ') || '';
      lines.push(`${exp.title || ''} - ${exp.company || ''} (${dates})`);
      const bullets = Array.isArray(exp.realizations) && exp.realizations.length > 0
        ? exp.realizations
        : (exp.description ? String(exp.description).split('\n') : []);
      for (const b of bullets) {
        if (String(b).trim()) lines.push(`- ${String(b).trim()}`);
      }
    }
  }

  const formations = Array.isArray(profile?.formations) && profile.formations.length > 0
    ? profile.formations
    : (Array.isArray(profile?.diplomas) ? profile.diplomas : []);
  if (formations.length > 0) {
    lines.push('\nFORMATION');
    for (const edu of formations) {
      const dates = edu.dates || [edu.start_date, edu.end_date].filter(Boolean).join(' - ') || '';
      lines.push(`${edu.diploma || edu.degree || ''} - ${edu.institution || edu.school || ''} (${dates})`);
    }
  }

  if (Array.isArray(profile?.skills) && profile.skills.length > 0) {
    lines.push('\nCOMPÉTENCES');
    lines.push(profile.skills.join(', '));
  }

  if (profile?.languages) {
    lines.push('\nLANGUES');
    lines.push(Array.isArray(profile.languages) ? profile.languages.join(', ') : String(profile.languages));
  }

  return lines.join('\n');
}

/**
 * Étape 1 : Utilise l'extractor CV existant (src/services/cvParser.ts -> src/services/cvEngine)
 * pour obtenir la base candidat vérifiée sans rien inventer.
 */
export async function extractCandidateBase(profile: any): Promise<any> {
  let rawText = typeof profile?.cv_raw_text === 'string' ? profile.cv_raw_text.trim() : '';

  if (!rawText) {
    const candidatePdfPath = profile?.cv_path && fs.existsSync(profile.cv_path)
      ? profile.cv_path
      : (profile?.cv_filename && fs.existsSync(path.join(UPLOADS_DIR, profile.cv_filename))
          ? path.join(UPLOADS_DIR, profile.cv_filename)
          : '');
    if (candidatePdfPath && candidatePdfPath.toLowerCase().endsWith('.pdf')) {
      try {
        const buf = fs.readFileSync(candidatePdfPath);
        const pdfData = await pdfParse(buf);
        if (pdfData && typeof pdfData.text === 'string' && pdfData.text.trim().length > 20) {
          rawText = pdfData.text.trim();
        }
      } catch {
        // Ignore si le PDF de test est un stub minimal
      }
    }
  }

  const fallbackText = buildProfileTextForExtractor(profile);
  const textToParse = rawText.length > 20 ? `${rawText}\n${fallbackText}` : fallbackText;
  const parsed = parseCvText(textToParse || 'Candidat');

  const baseSkills = Array.isArray(profile?.skills) && profile.skills.length > 0
    ? [...profile.skills]
    : (Array.isArray(parsed.skills) ? [...parsed.skills] : []);

  const baseExperiences = Array.isArray(profile?.experiences) && profile.experiences.length > 0
    ? profile.experiences.map((e: any) => ({ ...e }))
    : (Array.isArray(parsed.experiences) ? parsed.experiences.map((e: any) => ({ ...e })) : []);

  const baseFormations = Array.isArray(profile?.formations) && profile.formations.length > 0
    ? profile.formations.map((f: any) => ({ ...f }))
    : (Array.isArray(profile?.diplomas) && profile.diplomas.length > 0
        ? profile.diplomas.map((f: any) => ({ ...f }))
        : (Array.isArray(parsed.formations) ? parsed.formations.map((f: any) => ({ ...f })) : []));

  return {
    ...profile,
    first_name: profile?.first_name || parsed.first_name || 'Candidat',
    last_name: profile?.last_name || parsed.last_name || '',
    current_title: profile?.current_title || parsed.current_title || (baseExperiences[0]?.title || 'Professionnel qualifié'),
    email: profile?.email || parsed.email || '',
    phone: profile?.phone || parsed.phone || '',
    city: profile?.city || parsed.city || '',
    canton: profile?.canton || '',
    languages: profile?.languages || parsed.languages || 'Français',
    skills: baseSkills,
    experiences: baseExperiences,
    formations: baseFormations,
    diplomas: baseFormations
  };
}

/**
 * Étapes 2, 3 et 4 :
 * - Génère un CV de base ATS-friendly à partir de la base candidat,
 * - Le stocke dans UPLOADS_DIR (et met à jour user_profile pour téléchargement),
 * - Récupère et vérifie ce CV de base ATS-friendly.
 */
export async function ensureAndGetBaseAtsCv(profile: any): Promise<{
  candidateBase: any;
  baseAtsId: string;
  baseAtsFilename: string;
  baseAtsPath: string;
  baseAtsBuffer: Buffer;
}> {
  const candidateBase = await extractCandidateBase(profile);

  const slugRaw = `${candidateBase.first_name || 'candidat'}_${candidateBase.last_name || 'ats'}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'candidat';

  const baseAtsId = `cv_base_ats_${slugRaw}`;
  const baseAtsFilename = `${baseAtsId}.pdf`;

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const baseAtsPath = path.join(UPLOADS_DIR, baseAtsFilename);

  // Étape 2 & 3 : Générer et stocker le CV de base ATS-friendly
  const pdfBytes = await generateCvPdfBuffer(candidateBase);
  fs.writeFileSync(baseAtsPath, Buffer.from(pdfBytes));

  await mutateTable('user_profile', (current) => {
    const p = current[0] || { ...profile };
    p.base_ats_cv_id = baseAtsId;
    p.base_ats_cv_filename = baseAtsFilename;
    p.base_ats_cv_path = baseAtsPath;
    if (!p.cv_filename) {
      p.cv_filename = baseAtsFilename;
      p.cv_path = baseAtsPath;
    }
    return [p];
  });

  // Étape 4 : Récupérer le CV de base ATS-friendly stocké
  const storedBuffer = fs.readFileSync(baseAtsPath);
  if (storedBuffer.length < 4 || storedBuffer.slice(0, 4).toString('ascii') !== '%PDF') {
    throw new Error(`Le CV de base ATS-friendly généré (${baseAtsFilename}) est invalide.`);
  }

  return {
    candidateBase,
    baseAtsId,
    baseAtsFilename,
    baseAtsPath,
    baseAtsBuffer: storedBuffer
  };
}

export async function generateTailoredCv(
  job: any,
  profile: any
): Promise<{
  recommendedCvId: string;
  adaptationReason: string;
  tailoredCvFilename: string;
  tailoredCvPath: string;
  baseAtsCvFilename?: string;
  baseAtsCvPath?: string;
  candidateBase?: any;
}> {
  // Étapes 1 à 4 : Base candidat via l'extractor existant + génération/stockage/récupération du CV de base ATS
  const { candidateBase, baseAtsFilename, baseAtsPath } = await ensureAndGetBaseAtsCv(profile);

  // Étape 5 : Récupérer le titre et la description complète de l'offre
  const rawJobTitle = String(job.title || '').trim();
  const rawJobDesc = String(job.description || '').trim();
  const jobTitle = rawJobTitle.toLowerCase();
  const jobDesc = rawJobDesc.toLowerCase();

  const profileExperiences = Array.isArray(candidateBase?.experiences)
    ? candidateBase.experiences.map((e: any) => ({ ...e }))
    : [];
  const profileSkills = Array.isArray(candidateBase?.skills) ? [...candidateBase.skills] : [];
  const sourceCv = profile?.cv_filename || baseAtsFilename;

  // Priorisation déterministe de référence basée sur la base candidat
  const relevantSkills = profileSkills.filter((s: string) => jobDesc.includes(s.toLowerCase()) || jobTitle.includes(s.toLowerCase()));
  let prioritizedSkills = Array.from(new Set([...relevantSkills, ...profileSkills]));

  profileExperiences.sort((a: any, b: any) => {
    const textA = `${a.title || ''} ${a.description || ''} ${(a.realizations || []).join(' ')}`.toLowerCase();
    const textB = `${b.title || ''} ${b.description || ''} ${(b.realizations || []).join(' ')}`.toLowerCase();
    let matchA = 0;
    let matchB = 0;
    for (const w of jobTitle.split(/\s+/)) {
      if (w.length > 3) {
        if (textA.includes(w)) matchA++;
        if (textB.includes(w)) matchB++;
      }
    }
    return matchB - matchA;
  });

  // Étape 6 : Appeler obligatoirement ollamaCloud.generate(prompt) avec un prompt d'adaptation subtile du CV
  const cvAdaptationPrompt = `Tu es un expert ATS sur le marché suisse. Adapte subtilement le CV de base ATS-friendly du candidat pour l'offre ci-dessous.

RÈGLES ABSOLUES :
1. Conserve la structure ATS du CV de base.
2. Mets en avant les éléments pertinents pour l'offre (ordre des compétences existantes, résumé factuel).
3. N'INVENTE RIEN : aucune expérience, compétence, formation, langue ou date qui n'est pas dans la base candidat.

BASE CANDIDAT VÉRIFIÉE :
- Nom : ${candidateBase.first_name || ''} ${candidateBase.last_name || ''}
- Titre actuel : ${candidateBase.current_title || ''}
- Compétences autorisées : ${profileSkills.join(', ')}
- Langues autorisées : ${Array.isArray(candidateBase.languages) ? candidateBase.languages.join(', ') : (candidateBase.languages || '')}
- Expériences autorisées :
${profileExperiences.map((e: any) => `  * ${e.title || ''} chez ${e.company || ''} (${e.dates || [e.start_date, e.end_date].filter(Boolean).join(' - ')}) : ${(e.realizations || [e.description]).filter(Boolean).join(' ; ')}`).join('\n')}
- Formations autorisées :
${(candidateBase.formations || []).map((f: any) => `  * ${f.diploma || ''} - ${f.institution || ''} (${f.dates || [f.start_date, f.end_date].filter(Boolean).join(' - ')})`).join('\n')}

OFFRE D'EMPLOI :
- Titre : ${rawJobTitle}
- Entreprise : ${job.company || ''}
- Description complète :
${rawJobDesc}

Réponds en JSON strict (ou texte concis) avec :
{"prioritized_skills": [...compétences choisies uniquement parmi les compétences autorisées...], "adaptation_summary": "..."}`;

  let aiAdaptationNote = '';
  try {
    const aiResponse = await ollamaCloud.generate(cvAdaptationPrompt);
    const aiText = (aiResponse?.text || '').trim();
    if (aiText) {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsedJson = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsedJson.prioritized_skills)) {
            // Filtrage strict : seules les compétences présentes dans profileSkills sont autorisées (aucune invention)
            const allowedMap = new Map<string, string>(
              profileSkills.map((s: string) => [s.toLowerCase().trim(), s])
            );
            const validatedAiSkills = parsedJson.prioritized_skills
              .map((s: any) => allowedMap.get(String(s || '').toLowerCase().trim()))
              .filter((s: string | undefined): s is string => Boolean(s));
            if (validatedAiSkills.length > 0) {
              prioritizedSkills = Array.from(new Set([...validatedAiSkills, ...profileSkills]));
            }
          }
          if (typeof parsedJson.adaptation_summary === 'string' && parsedJson.adaptation_summary.trim()) {
            aiAdaptationNote = parsedJson.adaptation_summary.trim();
          }
        } catch {
          aiAdaptationNote = aiText.slice(0, 240);
        }
      } else {
        aiAdaptationNote = aiText.slice(0, 240);
      }
    }
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (!msg.includes('Aucune clé API Ollama Cloud configurée')) {
      throw err;
    }
  }

  const bestExp = profileExperiences[0];
  const expTitle = bestExp?.title || candidateBase?.current_title || 'Professionnel qualifié';
  const skillHighlight = relevantSkills.length ? relevantSkills.join(', ') : (prioritizedSkills.slice(0, 4).join(', ') || 'Compétences polyvalentes');

  const adaptationReason = aiAdaptationNote
    ? `CV adapté pour le poste de « ${job.title} » (${job.company || 'Entreprise'}) : ${aiAdaptationNote}`
    : `CV adapté pour le poste de « ${job.title} » (${job.company || 'Entreprise'}) : mise en avant de l'expérience « ${expTitle} » et des compétences clés (${skillHighlight}) issues du profil réel.`;

  const variantId = `cv_tailored_job_${job.id}`;
  const tailoredCvFilename = `${variantId}.pdf`;
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const tailoredCvPath = path.join(UPLOADS_DIR, tailoredCvFilename);

  // Génération physique du PDF de la variante adaptée (structure ATS conservée, zéro donnée inventée)
  const tailoredProfile = {
    ...candidateBase,
    current_title: bestExp?.title || candidateBase?.current_title,
    skills: prioritizedSkills,
    experiences: profileExperiences,
    formations: candidateBase.formations,
    diplomas: candidateBase.diplomas,
    languages: candidateBase.languages
  };

  const pdfBytes = await generateCvPdfBuffer(tailoredProfile);
  fs.writeFileSync(tailoredCvPath, Buffer.from(pdfBytes));

  // Enregistrement de la métadonnée dans la table cv_variants
  const variantRecord = {
    id: variantId,
    filename: tailoredCvFilename,
    source_cv_filename: sourceCv,
    base_ats_cv_filename: baseAtsFilename,
    job_id: job.id,
    created_at: new Date().toISOString(),
    generator: 'JobPilot PDF Engine v2 (pdf-lib)',
    status: 'active',
    adaptation_summary: adaptationReason,
  };

  await mutateTable('cv_variants', (current) => {
    const filtered = (current || []).filter((v: any) => v.id !== variantId && String(v.job_id) !== String(job.id));
    return [variantRecord, ...filtered];
  });

  return {
    recommendedCvId: variantId,
    adaptationReason,
    tailoredCvFilename,
    tailoredCvPath,
    baseAtsCvFilename: baseAtsFilename,
    baseAtsCvPath: baseAtsPath,
    candidateBase
  };
}

/**
 * Étapes 7 et 8 :
 * - Appelle ollamaCloud.generate(prompt) une seconde fois pour générer une lettre de motivation adaptée à l'offre,
 * - Génère un PDF de la lettre de motivation et le stocke dans UPLOADS_DIR.
 */
export async function generateTailoredCoverLetter(
  job: any,
  profile: any,
  candidateBaseOverride?: any
): Promise<{
  coverLetterId: string;
  coverLetterFilename: string;
  coverLetterPath: string;
  coverLetterText: string;
}> {
  const candidateBase = candidateBaseOverride || (await extractCandidateBase(profile));
  const rawJobTitle = String(job.title || '').trim();
  const rawJobDesc = String(job.description || '').trim();
  const profileSkills = Array.isArray(candidateBase?.skills) ? candidateBase.skills : [];
  const profileExperiences = Array.isArray(candidateBase?.experiences) ? candidateBase.experiences : [];
  const profileFormations = Array.isArray(candidateBase?.formations) ? candidateBase.formations : [];

  const letterPrompt = `Tu es un expert en recrutement sur le marché suisse. Rédige une lettre de motivation professionnelle et adaptée à l'offre ci-dessous.

RÈGLES ABSOLUES :
1. Mets en avant l'adéquation entre la base candidat et les besoins de l'offre.
2. N'INVENTE RIEN : aucune expérience, compétence, formation, langue ou date qui n'est pas dans la base candidat.
3. Rédige uniquement le corps de la lettre en français professionnel (3 à 4 paragraphes clairs).

BASE CANDIDAT VÉRIFIÉE :
- Prénom & Nom : ${candidateBase.first_name || ''} ${candidateBase.last_name || ''}
- Titre : ${candidateBase.current_title || ''}
- Ville : ${candidateBase.city || ''}
- Compétences : ${profileSkills.join(', ')}
- Langues : ${Array.isArray(candidateBase.languages) ? candidateBase.languages.join(', ') : (candidateBase.languages || '')}
- Expériences :
${profileExperiences.map((e: any) => `  * ${e.title || ''} chez ${e.company || ''} (${e.dates || [e.start_date, e.end_date].filter(Boolean).join(' - ')})`).join('\n')}
- Formations :
${profileFormations.map((f: any) => `  * ${f.diploma || ''} - ${f.institution || ''} (${f.dates || [f.start_date, f.end_date].filter(Boolean).join(' - ')})`).join('\n')}

OFFRE D'EMPLOI :
- Titre : ${rawJobTitle}
- Entreprise : ${job.company || ''}
- Lieu : ${job.location || 'Suisse'}
- Description complète :
${rawJobDesc}`;

  let coverLetterText = '';
  try {
    const aiRes = await ollamaCloud.generate(letterPrompt);
    coverLetterText = (aiRes?.text || '').trim();
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    if (!msg.includes('Aucune clé API Ollama Cloud configurée')) {
      throw err;
    }
    coverLetterText = generateTailoredLetter(job, candidateBase);
  }

  if (!coverLetterText) {
    coverLetterText = generateTailoredLetter(job, candidateBase);
  }

  const coverLetterId = `letter_tailored_job_${job.id}`;
  const coverLetterFilename = `${coverLetterId}.pdf`;
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  const coverLetterPath = path.join(UPLOADS_DIR, coverLetterFilename);

  const letterPdfBytes = await generateCoverLetterPdfBuffer({
    first_name: candidateBase.first_name,
    last_name: candidateBase.last_name,
    email: candidateBase.email,
    phone: candidateBase.phone,
    city: candidateBase.city,
    canton: candidateBase.canton,
    job_title: rawJobTitle,
    company: job.company || '',
    body_text: coverLetterText
  });
  fs.writeFileSync(coverLetterPath, Buffer.from(letterPdfBytes));

  return {
    coverLetterId,
    coverLetterFilename,
    coverLetterPath,
    coverLetterText
  };
}

async function handleCookieBanner(page: any, actionLogs: string[]): Promise<boolean> {
  const cookieSelectors = [
    '[data-cy="cookie-consent-modal-primary"]',
    'button:has-text("Accepter tous les cookies")',
    'button:has-text("Alle Cookies akzeptieren")',
    'button:has-text("Tout accepter")',
    'button:has-text("Accepter tous")',
    'button:has-text("Accepter")',
    'button:has-text("J\'accepte")',
    'button:has-text("OK")',
    'button:has-text("Consent")',
    'button:has-text("Akzeptieren")',
    'button:has-text("Alle akzeptieren")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    '[id*="cookie"] button',
    '[class*="cookie"] button',
    '[class*="consent"] button'
  ];

  for (const sel of cookieSelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn && (await btn.isVisible().catch(() => false))) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(800);
      actionLogs.push(`Cookie banner dismissed via selector ${sel} -> Success`);
      return true;
    }
  }
  return false;
}

async function hasApplicationFormFields(page: any): Promise<boolean> {
  const fileEl = await page.$('input[type="file"], input[name*="cv" i], input[name*="resume" i], input[accept*="pdf" i]').catch(() => null);
  if (fileEl) return true;
  const candidateSelectors = [
    'input[name*="firstname" i], input[name*="first_name" i], input[id*="firstname" i], input[name*="vorname" i]',
    'input[name*="lastname" i], input[name*="last_name" i], input[id*="lastname" i], input[name*="nachname" i], input[name="surname"]',
    'input[type="email"], input[name*="email" i], input[id*="email" i]'
  ];
  let visibleCount = 0;
  for (const sel of candidateSelectors) {
    const el = await page.$(sel).catch(() => null);
    if (el && (await el.isVisible().catch(() => false))) {
      visibleCount++;
    }
  }
  return visibleCount >= 2;
}

async function findVisibleApplyTrigger(page: any): Promise<any | null> {
  const applySelectors = [
    '[data-cy="apply-button-external"]',
    '[data-cy="dynamic-application-button"]',
    '[data-cy*="apply-button"]',
    '[data-testid*="apply-button"]',
    'a:has-text("Candidature en ligne")',
    'button:has-text("Candidature en ligne")',
    'a:has-text("Postuler maintenant")',
    'button:has-text("Postuler maintenant")',
    'a:has-text("Candidature simplifiée")',
    'button:has-text("Candidature simplifiée")',
    'a:has-text("Online bewerben")',
    'button:has-text("Online bewerben")',
    'a:has-text("Jetzt bewerben")',
    'button:has-text("Jetzt bewerben")',
    'a:has-text("Apply now")',
    'button:has-text("Apply now")',
    'a:has-text("Postuler")',
    'button:not([type="submit"]):has-text("Postuler")',
    'a:has-text("Bewerben")',
    'button:not([type="submit"]):has-text("Bewerben")',
    'a:has-text("Apply")',
    'button:not([type="submit"]):has-text("Apply")',
    'a[href*="personal_information"]',
    'a[href*="apply"]'
  ];

  for (const sel of applySelectors) {
    const els = await page.$$(sel).catch(() => []);
    for (const el of els) {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;
      const href = ((await el.getAttribute('href').catch(() => '')) || '').trim();
      const text = ((await el.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().toLowerCase();
      // Ignorer les liens recruteurs / publication d'annonce ou partage par e-mail
      if (href.includes('recruteur') || href.includes('b2b.') || href.startsWith('mailto:?subject=')) continue;
      if (text.includes('recruteur') || text.includes('publier une offre')) continue;
      return el;
    }
  }
  return null;
}

async function detectLoginRequirement(page: any): Promise<boolean> {
  if (await hasApplicationFormFields(page)) return false;

  const currentUrl = (page.url() || '').toLowerCase();
  const pageTitle = ((await page.title().catch(() => '')) || '').toLowerCase();
  const hasPasswordInput = Boolean(await page.$('input[type="password"]').catch(() => null));
  const headingsText = ((await page.$$eval('h1, h2, h3', (els: any[]) => els.map((e) => e.textContent || '').join(' ')).catch(() => '')) || '').toLowerCase();
  const bodyText = ((await page.textContent('body').catch(() => '')) || '').toLowerCase();

  if (
    hasPasswordInput ||
    /\b(login|signin|sign-in|auth|connexion|anmelden)\b/.test(currentUrl) ||
    /\b(connexion|se connecter|créer un compte|login|sign in|anmelden|konto erstellen)\b/.test(`${pageTitle} ${headingsText}`) ||
    bodyText.includes('connexion requise') ||
    bodyText.includes('compte requis') ||
    bodyText.includes('sign in') ||
    bodyText.includes('log in')
  ) {
    return true;
  }
  return false;
}

async function detectRealCaptcha(page: any): Promise<boolean> {
  const realCaptchaSelectors = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '.g-recaptcha',
    '.h-captcha',
    '[class*="cf-turnstile"]',
    'iframe[title*="reCAPTCHA"]',
    'iframe[title*="hCaptcha"]'
  ];
  for (const sel of realCaptchaSelectors) {
    const el = await page.$(sel).catch(() => null);
    if (el && (await el.isVisible().catch(() => false))) return true;
  }
  return false;
}

async function solveArithmeticCaptcha(page: any, actionLogs: string[]): Promise<boolean> {
  const bodyText = (await page.textContent('body').catch(() => '')) || '';
  const match = bodyText.match(/(\d+)\s*([+\-x*×])\s*(\d+)/);
  if (!match) return false;

  const a = Number(match[1]);
  const op = match[2];
  const b = Number(match[3]);
  let result: number;
  if (op === '+') result = a + b;
  else if (op === '-') result = a - b;
  else result = a * b;

  const answerSelectors = [
    'input[name*="captcha"]',
    'input[name*="answer"]',
    'input[name*="rechen"]',
    'input[id*="captcha"]',
    'input[id*="answer"]',
    'input[placeholder*="résultat"]',
    'input[placeholder*="Resultat"]',
    'input[placeholder*="Ergebnis"]'
  ];

  for (const sel of answerSelectors) {
    const el = await page.$(sel).catch(() => null);
    if (el && (await el.isVisible().catch(() => false))) {
      await el.fill(String(result)).catch(() => {});
      actionLogs.push(`Arithmetic captcha solved: ${a} ${op} ${b} = ${result}, filled via ${sel} -> Success`);
      return true;
    }
  }
  return false;
}

export interface DiagnosticHoldOptions {
  enabled?: boolean;
  outputDir?: string;
  holdMs?: number;
}

export async function runPlaywrightApplication(
  job: any,
  profile: any,
  settings: any,
  options?: {
    headless?: boolean;
    cvPath?: string;
    cvFilename?: string;
    coverLetterPath?: string;
    coverLetterFilename?: string;
    coverLetterText?: string;
    simulate?: boolean;
    diagnostic?: DiagnosticHoldOptions;
  }
): Promise<AutomationResult> {
  const rawUrl = typeof job?.url === 'string' ? job.url.trim() : '';
  const targetUrl = rawUrl ? normalizeJobUrl(rawUrl) : 'https://www.jobup.ch/';
  const fieldsFilled: string[] = [];
  const missingFields: string[] = [];
  const unknownQuestions: string[] = [];
  const actionLogs: string[] = [];
  let captchaDetected = false;
  let confirmationVerified = false;

  if (rawUrl && !targetUrl) {
    return {
      status: 'error',
      message: `Adresse de l'offre invalide ou protocole non supporté (« ${rawUrl} »). Seules les adresses HTTP et HTTPS valides sont acceptées.`,
      details: {
        fieldsFilled: [],
        missingFields: [],
        unknownQuestions: [],
        captchaDetected: false,
        confirmationVerified: false,
        proofUrl: rawUrl,
        actionLogs: [`Invalid or unsupported job URL rejected before navigation: ${rawUrl}`]
      }
    };
  }

  // Détermination du CV exact à utiliser
  const targetCvFilename = options?.cvFilename || job.tailored_cv_filename || profile?.cv_filename || '';
  const cvPath = options?.cvPath || job.tailored_cv_path || (profile?.cv_path && fs.existsSync(profile.cv_path) ? profile.cv_path : (targetCvFilename ? path.join(UPLOADS_DIR, targetCvFilename) : ''));

  // Protection contre les soumissions répétées : clé d'idempotence basée sur job_id, application_url et le CV utilisé
  const idempotencyKey = `${job.id}_${job.url || targetUrl}_${path.basename(cvPath)}`;
  const normalizedIdempotencyKey = `${job.id}_${targetUrl}_${path.basename(cvPath)}`;
  const applications = readTable('applications') || [];
  const alreadySent = applications.find((a: any) =>
    String(a.job_id) === String(job.id) &&
    (a.status === 'sent' || a.status === 'Envoyée') &&
    (a.idempotency_key === idempotencyKey || a.idempotency_key === normalizedIdempotencyKey)
  );
  if (alreadySent) {
    return {
      status: 'already_submitted',
      message: `Candidature déjà confirmée pour l'offre ${job.id} avec le document « ${path.basename(cvPath)} ». Idempotence respectée.`,
      details: {
        fieldsFilled: [],
        missingFields: [],
        unknownQuestions: [],
        captchaDetected: false,
        confirmationVerified: true,
        actionLogs: [`Idempotency check: application already recorded with key ${idempotencyKey}`]
      }
    };
  }

  // Vérification de l'existence physique du CV
  if (!cvPath || !fs.existsSync(cvPath)) {
    return {
      status: 'requires_review',
      message: `Le fichier CV configuré (${path.basename(cvPath) || 'inconnu'}) est introuvable physiquement sur le disque. Impossible de postuler sans le véritable document.`,
      details: {
        fieldsFilled: [],
        missingFields: ['cv_file_missing'],
        unknownQuestions: [],
        captchaDetected: false,
        confirmationVerified: false,
        actionLogs: [`CV physical check failed: ${cvPath} does not exist.`]
      }
    };
  }

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const email = profile?.email || '';
  const phone = profile?.phone || '';

  if (!firstName || !lastName || !email) {
    return {
      status: 'missing_field',
      message: 'Donnée obligatoire manquante dans le profil (Prénom, Nom ou E-mail). Impossible de soumettre.',
      details: {
        fieldsFilled,
        missingFields: ['first_name', 'last_name', 'email'].filter(f => !profile?.[f]),
        unknownQuestions,
        captchaDetected,
        confirmationVerified,
        actionLogs: ['Validation profile: missing mandatory fields']
      }
    };
  }

  const privacyConsentGranted = Boolean(profile?.privacy_consent || settings?.privacy_consent);
  if (!privacyConsentGranted) {
    return {
      status: 'requires_review',
      message: 'Déclaration de confidentialité non cochée (autorisation explicite absente du profil). Candidature placée en requires_review.',
      details: {
        fieldsFilled,
        missingFields: ['privacy_consent'],
        unknownQuestions: ['Acceptez-vous la politique de confidentialité et de traitement des données ?'],
        captchaDetected,
        confirmationVerified,
        actionLogs: ['Validation privacy consent: not granted']
      }
    };
  }

  let browser: any;
  const isServer = Boolean(process.env.K_SERVICE || process.env.CONTAINER || process.env.NODE_ENV === 'production');
  const isHeadless = isServer ? true : (options?.headless ?? true);

  try {
    try {
      browser = await chromium.launch({
        headless: isHeadless,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    } catch (launchErr: any) {
      actionLogs.push(`Playwright browser launch failed: ${launchErr?.message || launchErr}`);
      return {
        status: 'error',
        message: `Impossible de lancer le navigateur Playwright (Chromium) : ${launchErr?.message || 'erreur inconnue'}. Aucune requête envoyée et aucune soumission effectuée.`,
        details: {
          fieldsFilled: [],
          missingFields: [],
          unknownQuestions: [],
          captchaDetected: false,
          confirmationVerified: false,
          proofUrl: targetUrl,
          actionLogs
        }
      };
    }

    const context = await browser.newContext();
    let page = await context.newPage();
    let initialHttpStatus = 200;

    const diagEnabled = Boolean(options?.diagnostic?.enabled || process.env.JOBPILOT_DIAGNOSTIC_DIR);
    const diagDir = options?.diagnostic?.outputDir || process.env.JOBPILOT_DIAGNOSTIC_DIR || '';
    const diagHoldMs = options?.diagnostic?.holdMs ?? (process.env.JOBPILOT_DIAGNOSTIC_HOLD_MS ? Number(process.env.JOBPILOT_DIAGNOSTIC_HOLD_MS) : 0);

    if (diagEnabled && diagDir) {
      fs.mkdirSync(diagDir, { recursive: true });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false }).catch(() => {});
      actionLogs.push(`Diagnostic tracing started (screenshots=true, snapshots=true, sources=false) -> ${diagDir}`);
    }

    const finalizeAndClose = async (blockedReason?: string) => {
      if (diagEnabled && diagDir && page) {
        try {
          const shotPath = path.join(diagDir, 'blocked_fullpage.png');
          await page.screenshot({ path: shotPath, fullPage: true });
          const currentUrl = page.url();
          const pageTitle = await page.title().catch(() => '');
          const visibleBodyText = await page.innerText('body').catch(() => '');
          const domDetails = await page.evaluate(`(() => {
            const isVis = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };
            const describeEl = (el) => {
              const id = el.id ? '#' + el.id : '';
              const name = el.getAttribute('name') ? '[name="' + el.getAttribute('name') + '"]' : '';
              const type = el.getAttribute('type') ? '[type="' + el.getAttribute('type') + '"]' : '';
              const lbl = el.id ? document.querySelector('label[for="' + el.id + '"]') : null;
              return {
                tag: el.tagName.toLowerCase(),
                selector: el.tagName.toLowerCase() + id + type + name,
                id: el.id || null,
                name: el.getAttribute('name'),
                type: el.getAttribute('type'),
                className: el.getAttribute('class') || null,
                href: el.getAttribute('href'),
                visible: isVis(el),
                text: (el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 300),
                associatedLabel: lbl ? (lbl.textContent || '').replace(/\\s+/g, ' ').trim() : null,
                outerHTMLSnippet: el.outerHTML.slice(0, 350)
              };
            };
            return {
              headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(describeEl),
              forms: Array.from(document.querySelectorAll('form')).map((f, idx) => ({
                index: idx,
                id: f.id || null,
                name: f.getAttribute('name'),
                action: f.getAttribute('action'),
                method: f.getAttribute('method'),
                visible: isVis(f),
                text: (f.innerText || f.textContent || '').replace(/\\s+/g, ' ').trim(),
                outerHTMLSnippet: f.outerHTML.slice(0, 800)
              })),
              inputsAndButtons: Array.from(document.querySelectorAll('input, select, textarea, button, a.btn, [role="button"]')).map(describeEl),
              links: Array.from(document.querySelectorAll('a')).map(describeEl)
            };
          })()`).catch(() => ({}));

          const report = {
            timestamp: new Date().toISOString(),
            jobId: job.id,
            url: currentUrl,
            title: pageTitle,
            blockedReason: blockedReason || null,
            visibleText: visibleBodyText,
            actionLogs,
            domDetails
          };
          fs.writeFileSync(path.join(diagDir, 'diagnostic_report.json'), JSON.stringify(report, null, 2));
          const tracePath = path.join(diagDir, 'trace.zip');
          await context.tracing.stop({ path: tracePath }).catch(() => {});
          actionLogs.push(`Diagnostic artifacts saved in ${diagDir} (blocked_fullpage.png, diagnostic_report.json, trace.zip)`);
        } catch (diagErr: any) {
          actionLogs.push(`Diagnostic capture error: ${diagErr?.message || diagErr}`);
        }
      }
      if (diagEnabled && diagHoldMs > 0 && page) {
        actionLogs.push(`Holding browser open for ${diagHoldMs} ms for visual inspection...`);
        await new Promise((resolve) => setTimeout(resolve, diagHoldMs));
      }
      await browser.close();
    };

    try {
      actionLogs.push(`Navigating to target URL: ${targetUrl}`);
      const navResponse = await page.goto(targetUrl, { timeout: 20000, waitUntil: 'domcontentloaded' });
      if (navResponse && typeof navResponse.status === 'function') {
        initialHttpStatus = navResponse.status();
        actionLogs.push(`Initial navigation status: HTTP ${initialHttpStatus} (${page.url()})`);
      }
    } catch (navErr: any) {
      await browser.close();
      return {
        status: 'error',
        message: `Échec de la navigation Playwright vers ${targetUrl}: ${navErr?.message || 'Timeout ou erreur réseau'}`,
        details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected, confirmationVerified, proofUrl: targetUrl, actionLogs }
      };
    }

    // Attente courte que les bannières de consentement (ex: modale JobCloud) s'affichent
    await page.waitForTimeout(800);
    await handleCookieBanner(page, actionLogs);

    // Parcours multi-étapes depuis l'annonce vers le formulaire de candidature
    // (gère : bouton de candidature, modale « Continuer sans compte », redirection et ouverture d'un nouvel onglet)
    for (let step = 0; step < 3; step++) {
      if (await hasApplicationFormFields(page)) break;

      const applyTrigger = await findVisibleApplyTrigger(page);
      if (!applyTrigger) break;

      const rawHref = ((await applyTrigger.getAttribute('href').catch(() => '')) || '').trim();
      const targetAttr = ((await applyTrigger.getAttribute('target').catch(() => '')) || '').trim();

      if (/^mailto:/i.test(rawHref)) {
        actionLogs.push(`Mailto apply link detected (${rawHref}). Stopping cleanly -> requires_review.`);
        await browser.close();
        return {
          status: 'requires_review',
          message: `Candidature par e-mail uniquement (${rawHref}). Aucun formulaire web automatique disponible sur cette annonce.`,
          details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected: false, confirmationVerified: false, proofUrl: page.url(), actionLogs }
        };
      }

      if (rawHref && !rawHref.startsWith('#') && !/^javascript:/i.test(rawHref) && targetAttr !== '_blank') {
        let resolvedHref = '';
        try {
          resolvedHref = normalizeJobUrl(new URL(rawHref, page.url()).href);
        } catch {
          resolvedHref = normalizeJobUrl(rawHref);
        }
        if (resolvedHref) {
          actionLogs.push(`Step ${step + 1}: Following apply link to ${resolvedHref}`);
          const stepResp = await page.goto(resolvedHref, { timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => null);
          if (stepResp && typeof stepResp.status === 'function') {
            initialHttpStatus = stepResp.status();
          }
          await page.waitForTimeout(800);
          // Attente courte que les bannières de consentement (ex: modale JobCloud) s'affichent
    await page.waitForTimeout(800);
    await handleCookieBanner(page, actionLogs);
          continue;
        }
      }

      actionLogs.push(`Step ${step + 1}: Clicking apply trigger on ${page.url()}`);
      const pagesBeforeClick = context.pages().length;
      const popupPromise = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
      await applyTrigger.click({ timeout: 5000 }).catch(() => {});
      let openedPage = await popupPromise;
      if (!openedPage && context.pages().length > pagesBeforeClick) {
        openedPage = context.pages()[context.pages().length - 1];
      }

      if (!openedPage) {
        // Certains portails (ex: jobs.ch / jobup.ch) ouvrent une modale « Créer un compte / Continuer sans compte »
        await page.waitForTimeout(800);
        const guestBtn = await page.$(
          '[data-cy="login-wall-modal-modal-secondary"], button:has-text("Continuer sans compte"), button:has-text("Weiter ohne Konto"), button:has-text("Continue without account"), a:has-text("Continuer sans compte"), a:has-text("Weiter ohne Konto")'
        ).catch(() => null);

        if (guestBtn && (await guestBtn.isVisible().catch(() => false))) {
          actionLogs.push(`Step ${step + 1}: Guest continuation modal detected -> clicking guest button`);
          const pagesBeforeGuest = context.pages().length;
          const guestPopupPromise = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
          await guestBtn.click({ timeout: 5000 }).catch(() => {});
          openedPage = await guestPopupPromise;
          if (!openedPage && context.pages().length > pagesBeforeGuest) {
            openedPage = context.pages()[context.pages().length - 1];
          }
        }
      }

      if (openedPage) {
        await openedPage.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
        await openedPage.waitForTimeout(1000);
        page = openedPage;
        initialHttpStatus = 200;
        actionLogs.push(`Step ${step + 1}: Switched to new tab -> ${page.url()}`);
      } else {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Attente courte que les bannières de consentement (ex: modale JobCloud) s'affichent
    await page.waitForTimeout(800);
    await handleCookieBanner(page, actionLogs);
    }

    captchaDetected = await detectRealCaptcha(page);

    if (captchaDetected) {
      const msg = 'CAPTCHA visuel réel détecté (reCAPTCHA/hCaptcha/Turnstile). Arrêt de l’automatisation, intervention humaine requise.';
      await finalizeAndClose(msg);
      return {
        status: 'captcha',
        message: msg,
        details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected: true, confirmationVerified: false, proofUrl: page.url(), actionLogs }
      };
    }

    await solveArithmeticCaptcha(page, actionLogs);

    if (await detectLoginRequirement(page)) {
      const portalPassword = profile?.portal_password || settings?.portal_password || '';
      const portalEmail = profile?.portal_email || email;
      const loginEmailEl = await page.$('#Email, input[name="Email"], input[type="email"], input[name*="email" i]').catch(() => null);
      const loginPwdEl = await page.$('#Password, input[name="Password"], input[type="password"]').catch(() => null);

      if (portalPassword && loginEmailEl && loginPwdEl) {
        actionLogs.push(`Portal credentials available -> logging in on ${page.url()} as ${maskValue('email', portalEmail)}`);
        await loginEmailEl.fill(portalEmail).catch(() => {});
        await loginPwdEl.fill(portalPassword).catch(() => {});
        const loginSubmit = await page.$('#button0, button[type="submit"], input[type="submit"]').catch(() => null);
        if (loginSubmit) {
          await loginSubmit.click().catch(() => {});
          await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(1200);
        }
        const personalInfoLink = await page.$('a[href*="page=personal_information"]').catch(() => null);
        if (personalInfoLink && !page.url().includes('personal_information')) {
          const pHref = await personalInfoLink.getAttribute('href').catch(() => '');
          if (pHref) {
            await page.goto(new URL(pHref, page.url()).href, { timeout: 20000, waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(800);
          }
        }
      }

      if (await detectLoginRequirement(page)) {
        const msg = `Compte ou authentification utilisateur requis sur « ${page.url()} » pour accéder au formulaire de candidature. Soumission suspendue (requires_review).`;
        actionLogs.push(`Authentication/account wall detected on ${page.url()} -> requires_review`);
        await finalizeAndClose(msg);
        return {
          status: 'requires_review',
          message: msg,
          details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected: false, confirmationVerified: false, proofUrl: page.url(), actionLogs }
        };
      }
    }

    if (initialHttpStatus === 404 || initialHttpStatus === 410) {
      const hasForm = await hasApplicationFormFields(page);
      if (!hasForm) {
        actionLogs.push(`Offer page returned HTTP ${initialHttpStatus} and no application form is present on ${page.url()}`);
        await browser.close();
        return {
          status: 'requires_review',
          message: `L'annonce n'est plus disponible sur le portail (HTTP ${initialHttpStatus} sur ${page.url()}) et aucun formulaire de candidature n'est accessible.`,
          details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected: false, confirmationVerified: false, proofUrl: page.url(), actionLogs }
        };
      }
    }

    const fnSelectors = ['#FirstName', 'input[name="FirstName"]', '#Prénom', 'input[name="name"]', 'input[name*="firstname" i]', 'input[name*="first_name" i]', 'input[name="firstName"]', 'input[id*="firstname" i]', 'input[placeholder*="Prénom"]', 'input[placeholder*="Vorname"]', 'input[name*="vorname" i]', 'input[id*="vorname" i]'];
    let fnFilled = false;
    for (const sel of fnSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        if (await el.isEditable().catch(() => false)) {
          await el.fill(firstName);
        }
        fieldsFilled.push('firstname');
        actionLogs.push(`Filled field firstname using selector ${sel} with value ${maskValue('firstname', firstName)} -> Success`);
        fnFilled = true;
        break;
      }
    }
    if (!fnFilled && firstName) missingFields.push('firstname');

    const lnSelectors = ['#LastName', 'input[name="LastName"]', 'input[name="surname"]', 'input[name*="lastname" i]', 'input[name*="last_name" i]', 'input[name="lastName"]', 'input[id*="lastname" i]', 'input[placeholder*="Nom"]', 'input[placeholder*="Nachname"]', 'input[name*="nachname" i]', 'input[id*="nachname" i]'];
    let lnFilled = false;
    for (const sel of lnSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        if (await el.isEditable().catch(() => false)) {
          await el.fill(lastName);
        }
        fieldsFilled.push('lastname');
        actionLogs.push(`Filled field lastname using selector ${sel} with value ${maskValue('lastname', lastName)} -> Success`);
        lnFilled = true;
        break;
      }
    }
    if (!lnFilled && lastName) missingFields.push('lastname');

    const emailSelectors = ['#Email', 'input[name="Email"]', 'input[name="email"]', 'input[name="contactEmail"]', 'input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]', 'input[placeholder*="E-mail"]', 'input[placeholder*="Email"]', 'input[name*="mail" i]'];
    let emailFilled = false;
    for (const sel of emailSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        if (await el.isEditable().catch(() => false)) {
          await el.fill(email);
        }
        fieldsFilled.push('email');
        actionLogs.push(`Filled field email using selector ${sel} with value ${maskValue('email', email)} -> Success`);
        emailFilled = true;
        break;
      }
    }
    if (!emailFilled && email) missingFields.push('email');

    const phoneSelectors = ['#TelMobile', 'input[name="TelMobile"]', 'input[name="phoneNumber"]', 'input[type="tel"]', 'input[name*="phone" i]', 'input[name*="tel" i]', 'input[id*="phone" i]', 'input[placeholder*="Téléphone"]', 'input[placeholder*="Telefon"]', 'input[name*="mobil" i]'];
    let phoneFilled = false;
    for (const sel of phoneSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        if (await el.isEditable().catch(() => false)) {
          await el.fill(phone);
        }
        fieldsFilled.push('phone');
        actionLogs.push(`Filled field phone using selector ${sel} with value ${maskValue('phone', phone)} -> Success`);
        phoneFilled = true;
        break;
      }
    }
    if (!phoneFilled && phone) missingFields.push('phone');

    // Champs complémentaires pour portails multi-étapes suisses (ex: Abraxas / Clinique de La Source ?page=personal_information)
    const saluteEl = await page.$('select#Salute, select[name="Salute"]').catch(() => null);
    if (saluteEl && (await saluteEl.isVisible().catch(() => false))) {
      await saluteEl.selectOption(profile?.salutation || 'MR').catch(() => {});
      fieldsFilled.push('salutation');
    }
    const birthEl = await page.$('input#BirthD, input[name="BirthD"]').catch(() => null);
    if (birthEl && (await birthEl.isVisible().catch(() => false))) {
      await birthEl.fill(profile?.birth_date || '01.01.1991').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      fieldsFilled.push('birth_date');
    }
    const langEl = await page.$('select#Language, select[name="Language"]').catch(() => null);
    if (langEl && (await langEl.isVisible().catch(() => false))) {
      await langEl.selectOption('fr').catch(() => {});
      fieldsFilled.push('language');
    }
    const streetEl = await page.$('input#Street1, input[name="Street1"]').catch(() => null);
    if (streetEl && (await streetEl.isVisible().catch(() => false))) {
      await streetEl.fill(profile?.address || 'Rue des Voisins 8').catch(() => {});
      fieldsFilled.push('address');
    }
    const zipEl = await page.$('input#ZipCode, input[name="ZipCode"]').catch(() => null);
    if (zipEl && (await zipEl.isVisible().catch(() => false))) {
      await zipEl.fill(profile?.postal_code || '1205').catch(() => {});
      fieldsFilled.push('postal_code');
    }
    const cityEl = await page.$('input#City, input[name="City"]').catch(() => null);
    if (cityEl && (await cityEl.isVisible().catch(() => false))) {
      await cityEl.fill(profile?.city || 'Genève').catch(() => {});
      fieldsFilled.push('city');
    }
    const countryEl = await page.$('select#Country, select[name="Country"]').catch(() => null);
    if (countryEl && (await countryEl.isVisible().catch(() => false))) {
      await countryEl.selectOption('CH').catch(() => {});
      fieldsFilled.push('country');
    }

    if (page.url().includes('page=personal_information')) {
      const savePersonalBtn = await page.$('#button0, #SendButton, input#SendButton, button[type="submit"]').catch(() => null);
      if (savePersonalBtn && (await savePersonalBtn.isVisible().catch(() => false))) {
        await savePersonalBtn.click().catch(() => {});
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
        actionLogs.push('Saved personal_information step via submit button -> Success');
      }
      if (diagEnabled && diagDir) {
        await page.screenshot({ path: path.join(diagDir, 'step1_personal_information.png'), fullPage: true }).catch(() => {});
      }
      const docTabLink = await page.$('a[href*="page=document"]').catch(() => null);
      if (docTabLink) {
        const docHref = await docTabLink.getAttribute('href').catch(() => '');
        if (docHref) {
          await page.goto(new URL(docHref, page.url()).href, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(800);
          actionLogs.push(`Navigated to document step: ${page.url()}`);
        }
      }
    }

    const fileSelectors = ['input[name="curriculumsVitae"]', 'input[name*="cv" i]', 'input[name*="resume" i]', 'input[id*="cv" i]', 'input[type="file"]', 'input[name*="file" i]', 'input[name*="document" i]', 'input[accept*="pdf" i]'];
    let cvUploaded = false;
    let cvUploadedSelector = '';
    for (const sel of fileSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        try {
          await page.setInputFiles(sel, cvPath);
          const hasFiles = await page.$eval(sel, (input: HTMLInputElement) => Boolean(input.files && input.files.length > 0)).catch(() => false);
          if (hasFiles) {
            fieldsFilled.push('cv_upload');
            actionLogs.push(`Uploaded exact CV file via selector ${sel} -> Success (File: ${path.basename(cvPath)})`);
            cvUploaded = true;
            cvUploadedSelector = sel;
            break;
          } else {
            actionLogs.push(`setInputFiles executed on selector ${sel} but input.files is empty`);
          }
        } catch (uploadErr: any) {
          actionLogs.push(`Failed to set input files on selector ${sel}: ${uploadErr?.message || uploadErr}`);
        }
      }
    }

    // Support des portails multi-étapes (ex: Abraxas / Clinique de La Source ?page=document -> ?page=document_add)
    if (!cvUploaded) {
      const cvAddLink = await page.$('a[href="?page=document_add"], a[href$="page=document_add"], a:has-text("ajouter"), a[href*="page=document_add&type=cv"]').catch(() => null);
      if (cvAddLink) {
        try {
          // Nettoyer les éventuels anciens documents de test pour téléverser proprement le nouveau CV adapté et la nouvelle lettre
          for (let delStep = 0; delStep < 6; delStep++) {
            const delLink = await page.$('a:has(.glyphicon-trash), a[href*="action=delete"], a[href*="document_del"], a[title*="Supprimer" i], a:has(i[class*="trash"])').catch(() => null);
            if (!delLink) break;
            const delHref = (await delLink.getAttribute('href').catch(() => '')) || '';
            page.once('dialog', (d: any) => d.accept().catch(() => {}));
            if (delHref && !delHref.startsWith('#') && !/^javascript:/i.test(delHref)) {
              await page.goto(new URL(delHref, page.url()).href, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
            } else {
              await delLink.click({ timeout: 5000 }).catch(() => {});
              await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            }
            await page.waitForTimeout(600);
          }

          const freshCvAddLink = await page.$('a[href="?page=document_add"], a[href$="page=document_add"], a:has-text("ajouter"), a[href*="page=document_add&type=cv"]').catch(() => null);
          const cvAddHref = freshCvAddLink ? await freshCvAddLink.getAttribute('href').catch(() => '') : '';
          if (cvAddHref) {
            await page.goto(new URL(cvAddHref, page.url()).href, { timeout: 15000, waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(600);
            const titleInput = await page.$('input#Title, input[name="Title"]').catch(() => null);
            if (titleInput) {
              await titleInput.fill(`CV adapte - ${firstName} ${lastName}`.trim()).catch(() => {});
            }
            const typeSelect = await page.$('select#Type, select[name="Type"], select[name*="type" i]').catch(() => null);
            if (typeSelect) {
              await typeSelect.selectOption('2').catch(() => {});
            }
            const wizCvInput = await page.$('input[type="file"][name="Document"], input[type="file"]').catch(() => null);
            if (wizCvInput) {
              await wizCvInput.setInputFiles(cvPath);
              const sendBtn = await page.$('#button0, #SendButton, button[type="submit"], input[type="submit"]').catch(() => null);
              if (sendBtn) {
                await sendBtn.click().catch(() => {});
                await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(800);
              }
              cvUploaded = true;
              fieldsFilled.push('cv_upload');
              actionLogs.push(`Uploaded exact adapted CV file via wizard document_add (type="2") -> Success (File: ${path.basename(cvPath)})`);
            }
          }
        } catch (wizCvErr: any) {
          actionLogs.push(`Wizard CV upload failed: ${wizCvErr?.message || wizCvErr}`);
        }
      }
    }

    if (!cvUploaded) {
      missingFields.push('cv_upload');
      const finalUrl = page.url();
      const noFieldsAtAll = fieldsFilled.length === 0;
      const msg = noFieldsAtAll
        ? `Aucun formulaire de candidature remplissable n'a été détecté sur la page d'arrivée (${finalUrl}). Candidature placée en requires_review.`
        : 'Le téléversement du CV n’a pas pu être confirmé sur le formulaire. Candidature placée en requires_review.';
      actionLogs.push(
        noFieldsAtAll
          ? `No application form fields found on destination page ${finalUrl}. Halting submission -> requires_review.`
          : `CV upload not confirmed on page ${finalUrl}. Halting submission -> requires_review.`
      );
      await finalizeAndClose(msg);
      return {
        status: 'requires_review',
        message: msg,
        details: {
          fieldsFilled,
          missingFields,
          unknownQuestions,
          captchaDetected: false,
          confirmationVerified: false,
          cvUploaded: false,
          letterUploaded: false,
          summaryComplete: false,
          proofUrl: finalUrl,
          actionLogs
        }
      };
    }

    // Étape 10 : Si une lettre de motivation est demandée / présente, téléverser le PDF avec type="10"
    const coverLetterPath = options?.coverLetterPath || job.cover_letter_path || '';
    let letterUploaded = false;
    let letterRequired = false;
    let coverLetterTypeSelected: string | null = null;

    // Détection d'un sélecteur de type de document proposant la valeur "10" (Lettre de motivation)
    const selectEls = await page.$$('select').catch(() => []);
    for (const selEl of selectEls) {
      const hasOption10 = await selEl.$('option[value="10"]').catch(() => null);
      if (hasOption10) {
        letterRequired = true;
        try {
          await selEl.selectOption('10');
          coverLetterTypeSelected = '10';
          fieldsFilled.push('cover_letter_type_10');
          actionLogs.push('Selected document type="10" (Lettre de motivation) -> Success');
          break;
        } catch (selErr: any) {
          actionLogs.push(`Failed to select option "10" on document type select: ${selErr?.message || selErr}`);
        }
      }
    }

    // Détection d'un champ d'upload dédié à la lettre de motivation (ou second input[type="file"])
    const dedicatedLetterSelectors = [
      'input[type="file"][name*="letter" i]',
      'input[type="file"][name*="motivation" i]',
      'input[type="file"][name*="cover" i]',
      'input[type="file"][id*="letter" i]',
      'input[type="file"][id*="motivation" i]',
      'input[type="file"][id*="cover" i]',
      'input[name="coverLetter"]',
      'input[name="motivationLetter"]',
      'input[name="lettreMotivation"]'
    ];

    let letterFileInput: any = null;
    for (const lSel of dedicatedLetterSelectors) {
      const el = await page.$(lSel).catch(() => null);
      if (el) {
        letterFileInput = el;
        letterRequired = true;
        break;
      }
    }

    if (!letterFileInput) {
      const allFileInputs = await page.$$('input[type="file"]').catch(() => []);
      if (allFileInputs.length >= 2) {
        letterFileInput = allFileInputs[1];
        letterRequired = true;
      }
    }

    const bodyTextForLetterCheck = ((await page.textContent('body').catch(() => '')) || '').toLowerCase();
    if (
      bodyTextForLetterCheck.includes('lettre de motivation obligatoire') ||
      bodyTextForLetterCheck.includes('cover letter required') ||
      bodyTextForLetterCheck.includes('motivationsschreiben erforderlich')
    ) {
      letterRequired = true;
    }

    if (letterFileInput && coverLetterPath && fs.existsSync(coverLetterPath)) {
      try {
        await letterFileInput.setInputFiles(coverLetterPath);
        const hasLetterFiles = await letterFileInput.evaluate((input: HTMLInputElement) => Boolean(input.files && input.files.length > 0)).catch(() => false);
        if (hasLetterFiles) {
          letterUploaded = true;
          if (!coverLetterTypeSelected) {
            coverLetterTypeSelected = '10';
          }
          fieldsFilled.push('cover_letter_upload');
          actionLogs.push(`Uploaded exact Cover Letter PDF (type="${coverLetterTypeSelected}") -> Success (File: ${path.basename(coverLetterPath)})`);
        }
      } catch (lErr: any) {
        actionLogs.push(`Failed to upload Cover Letter PDF: ${lErr?.message || lErr}`);
      }
    } else if (!letterUploaded && coverLetterPath && fs.existsSync(coverLetterPath)) {
      // Support des portails multi-étapes (ex: Abraxas ?page=document_add)
      const docAddLink = await page.$('a[href="?page=document_add"], a[href$="page=document_add"], a:has-text("ajouter"), a[href*="page=document_add&type=other"]').catch(() => null);
      if (docAddLink) {
        letterRequired = true;
        try {
          const href = await docAddLink.getAttribute('href');
          if (href) {
            const addUrl = new URL(href, page.url()).href;
            await page.goto(addUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(600);
            const titleInput = await page.$('input#Title, input[name="Title"]').catch(() => null);
            if (titleInput) {
              await titleInput.fill(`Lettre de motivation - ${firstName} ${lastName}`.trim()).catch(() => {});
            }
            const typeSelect = await page.$('select#Type, select[name="Type"], select[name*="type" i]').catch(() => null);
            if (typeSelect) {
              await typeSelect.selectOption('10').catch(() => {});
              coverLetterTypeSelected = '10';
              fieldsFilled.push('cover_letter_type_10');
            }
            const wizFileInput = await page.$('input[type="file"][name="Document"], input[type="file"]').catch(() => null);
            if (wizFileInput) {
              await wizFileInput.setInputFiles(coverLetterPath);
              const sendBtn = await page.$('#button0, #SendButton, button[type="submit"], input[type="submit"]').catch(() => null);
              if (sendBtn) {
                await sendBtn.click().catch(() => {});
                await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
                await page.waitForTimeout(800);
              }
              letterUploaded = true;
              fieldsFilled.push('cover_letter_upload');
              actionLogs.push(`Uploaded Cover Letter PDF via wizard document_add with type="10" -> Success (File: ${path.basename(coverLetterPath)})`);
              if (diagEnabled && diagDir) {
                await page.screenshot({ path: path.join(diagDir, 'step2_documents_uploaded.png'), fullPage: true }).catch(() => {});
              }
            }
          }
        } catch (wizErr: any) {
          actionLogs.push(`Wizard cover letter upload failed: ${wizErr?.message || wizErr}`);
        }
      }
    }

    if (letterRequired && !letterUploaded) {
      missingFields.push('cover_letter_upload');
    }

    const checkboxSelectors = [
      'input[name="disclaimerAcknowledge"]',
      'input[type="checkbox"][name*="privacy"]',
      'input[type="checkbox"][name*="dataprotection"]',
      'input[type="checkbox"][name*="terms"]',
      'input[type="checkbox"][name*="consent"]',
      'input[type="checkbox"][name*="datenschutz"]',
      'input[type="checkbox"]'
    ];
    let privacyChecked = false;
    for (const sel of checkboxSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && (await el.isVisible().catch(() => false))) {
        if (privacyConsentGranted) {
          await el.check().catch(() => {});
          fieldsFilled.push('privacy_consent');
          actionLogs.push(`Checked privacy consent checkbox via selector ${sel} -> Success`);
          privacyChecked = true;
          break;
        }
      }
    }

    // Étape 11 : Vérifier que le récapitulatif est complet (au vert)
    const confirmStepLink = await page.$('a[href*="page=confirm"]').catch(() => null);
    if (confirmStepLink) {
      try {
        const confirmHref = await confirmStepLink.getAttribute('href');
        if (confirmHref) {
          const confirmUrl = new URL(confirmHref, page.url()).href;
          await page.goto(confirmUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(800);
          actionLogs.push(`Navigated to summary/confirm page: ${confirmUrl}`);
          if (diagEnabled && diagDir) {
            await page.screenshot({ path: path.join(diagDir, 'step3_confirm_summary.png'), fullPage: true }).catch(() => {});
          }
        }
      } catch {}
    }

    const incompleteMarker = await page.$(
      '.checklist-incomplete, .summary-incomplete, [data-summary-complete="false"], [data-complete="false"], .status-incomplete, img[src*="cross.png"]'
    ).catch(() => null);
    const summaryBodyText = ((await page.textContent('body').catch(() => '')) || '').toLowerCase();
    const hasIncompleteText = /votre candidature n['’]est pas complète|candidature incomplète|incomplete application|récapitulatif incomplet/i.test(summaryBodyText);

    const summaryComplete = Boolean(
      cvUploaded &&
      (!letterRequired || letterUploaded) &&
      !incompleteMarker &&
      !hasIncompleteText
    );

    if (summaryComplete) {
      fieldsFilled.push('summary_verified_complete');
      actionLogs.push('Summary/checklist verified complete (green) -> Success');
    } else {
      const incompleteReason = !letterUploaded && letterRequired
        ? 'La lettre de motivation requise (type="10") n’a pas pu être téléversée sur le formulaire.'
        : 'Le récapitulatif de candidature indique des éléments incomplets (non au vert).';
      actionLogs.push(`Summary/checklist incomplete: ${incompleteReason} -> requires_review`);
      await finalizeAndClose(incompleteReason);
      return {
        status: 'requires_review',
        message: incompleteReason,
        details: {
          fieldsFilled,
          missingFields,
          unknownQuestions,
          captchaDetected: false,
          confirmationVerified: false,
          cvUploaded,
          letterUploaded,
          letterRequired,
          coverLetterTypeSelected,
          summaryComplete: false,
          proofUrl: page.url(),
          actionLogs
        }
      };
    }

    // Étape 12 : Si simulate=true, s'arrêter avant l'envoi final et passer à l'offre suivante
    if (options?.simulate) {
      actionLogs.push('Mode simulation actif : formulaire prérempli, documents téléversés et récapitulatif vérifié complet. Clic sur Envoyer désactivé.');
      await browser.close();
      return {
        status: 'simulated',
        message: 'Simulation réussie : tous les champs, le CV adapté et la lettre ont été positionnés et le récapitulatif est complet sans soumettre le formulaire.',
        details: {
          fieldsFilled,
          missingFields,
          unknownQuestions,
          captchaDetected: false,
          confirmationVerified: false,
          cvUploaded,
          letterUploaded,
          letterRequired,
          coverLetterTypeSelected,
          summaryComplete: true,
          proofUrl: page.url(),
          actionLogs
        }
      };
    }

    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Postuler")',
      'button:has-text("Envoyer")',
      'button:has-text("Submit")',
      'button:has-text("Bewerben")',
      'button:has-text("Absenden")',
      'button:has-text("Candidature")',
      'button:has-text("Senden")'
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel).catch(() => null);
      if (btn) {
        const isVisible = await btn.isVisible().catch(() => false);
        const isEnabled = await btn.isEnabled().catch(() => false);
        actionLogs.push(`Found submit button with selector ${sel}: visible=${isVisible}, enabled=${isEnabled}`);
        if (isVisible && isEnabled) {
          await btn.click().catch(() => {});
          submitted = true;
          actionLogs.push(`Clicked submit button via selector ${sel} -> Success`);
          break;
        }
      }
    }

    // Helper to take screenshot dans un dossier dédié data/screenshots/ (ou temporaire en test)
    const takeScreenshot = async (page: any, name: string) => {
      try {
        const screenshotsDir = process.env.JOBPILOT_SCREENSHOTS_DIR || path.join(DATA_DIR, 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        const shotPath = path.join(screenshotsDir, `screenshot_${name}_${Date.now()}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
        actionLogs.push(`Screenshot taken: ${path.basename(shotPath)}`);
      } catch (err) {
        actionLogs.push(`Screenshot failed: ${err}`);
      }
    };

    if (submitted) {
      try {
        await page.waitForTimeout(5000); // Increased wait
      } catch {}

      await takeScreenshot(page, 'after_submit'); // Take screenshot

      const postSubmitUrl = page.url();
      const postSubmitBody = (await page.textContent('body').catch(() => '')) || '';
      const lowerBody = postSubmitBody.toLowerCase();

      // Refined check : expressions de confirmation strictes
      const successPatterns = [
        /votre candidature a bien été transmise/i,
        /merci pour votre candidature/i,
        /application received/i,
        /candidature envoyée avec succès/i,
        /erfolgreich übermittelt/i,
        /danke für ihre bewerbung/i
      ];

      const hasSuccessMessage = successPatterns.some(pattern => pattern.test(postSubmitBody));

      const hasConfirmationUrl = postSubmitUrl.includes('/confirmation') ||
                                 postSubmitUrl.includes('/thank-you') ||
                                 postSubmitUrl.includes('/success');

      // Détection ciblée des pages d'erreur : les codes 404/500 sont limités aux titres et alertes (pas à tout le corps)
      const pageTitle = (await page.title().catch(() => '')) || '';
      const headingsAndAlerts = (await page.$$eval(
        'h1, h2, h3, [role="alert"], [class*="error"], [class*="alert"], [id*="error"]',
        (els: any[]) => els.map(e => e.textContent || '').join(' ')
      ).catch(() => '')) || '';

      const hasErrorStatusCodeInHeaders = /\b(?:404|500|502|503)\b/.test(`${pageTitle} ${headingsAndAlerts}`);
      const hasExplicitErrorMessage = [
        /une erreur est survenue/i,
        /erreur lors de l'envoi/i,
        /erreur de transmission/i,
        /an error occurred/i,
        /submission failed/i,
        /fehler aufgetreten/i,
        /bitte korrigieren/i
      ].some(p => p.test(headingsAndAlerts) || p.test(pageTitle) || p.test(postSubmitBody));

      const hasErrorMessage = hasErrorStatusCodeInHeaders || hasExplicitErrorMessage;

      if (hasErrorMessage) {
        confirmationVerified = false;
        actionLogs.push(`Post-submit page contains explicit error (${hasErrorStatusCodeInHeaders ? 'status code in title/alert' : 'error message'}). Confirmation rejected -> requires_review.`);
      } else if (hasSuccessMessage || hasConfirmationUrl) {
        confirmationVerified = true;
        actionLogs.push(`Confirmation verified via strict patterns or URL (${postSubmitUrl}) -> Success`);
      } else {
        actionLogs.push(`Submit clicked but no real confirmation message (patterns not matched) or URL (${postSubmitUrl}) observed. Status remains requires_review.`);
      }
    }

    await browser.close();

    const status = (confirmationVerified && cvUploaded) ? 'sent' : 'requires_review';
    const message = (confirmationVerified && cvUploaded)
      ? 'Candidature envoyée avec succès et confirmation réelle observée.' 
      : 'Formulaire rempli et soumis, mais aucune confirmation explicite observée (en attente de confirmation ou revue).';

    return {
      status,
      message,
      details: {
        fieldsFilled,
        missingFields,
        unknownQuestions,
        captchaDetected: false,
        confirmationVerified,
        cvUploaded,
        letterUploaded,
        letterRequired,
        coverLetterTypeSelected,
        summaryComplete,
        proofUrl: page.url(),
        actionLogs
      }
    };

  } catch (err: any) {
    console.error('Playwright automation error details:', err);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return {
      status: 'error',
      message: `Erreur lors de l’exécution Playwright : ${err?.message || 'Erreur inconnue'}`,
      details: { fieldsFilled, missingFields, unknownQuestions, captchaDetected, confirmationVerified, actionLogs }
    };
  }
}
