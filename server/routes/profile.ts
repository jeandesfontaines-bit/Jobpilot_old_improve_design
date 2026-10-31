/**
 * Routes Profil Candidat — Analyse de CV, consultation, mise à jour et upload de CV.
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { readTable, mutateTable, UPLOADS_DIR, DATA_DIR } from '../db.ts';
import { parseCvText } from '../../src/services/cvParser.ts';
import { calculateJobScore } from '../../src/services/swissJobHelpers.ts';
import { generateCvPdfBuffer } from '../services/cvPdfGenerator.ts';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const router = Router();

// 4. Candidate Profile & CV Text Analysis
router.post('/api/profile/analyze-cv-text', (req, res) => {
  try {
    const { cv_text } = req.body;
    if (!cv_text || typeof cv_text !== 'string' || cv_text.trim().length === 0) {
      return res.status(400).json({ error: 'Veuillez coller le texte de votre CV dans la zone prévue à cet effet.' });
    }

    const parsed = parseCvText(cv_text);
    res.json({
      success: true,
      parsed_data: parsed
    });
  } catch (err: any) {
    console.error('CV text analysis error:', err);
    res.status(500).json({ error: err.message || 'Erreur lors de l’analyse du texte du CV.' });
  }
});

router.get('/api/profile', (req, res) => {
  const profile = readTable('user_profile')[0] || {};
  if (!Array.isArray(profile.excluded_roles)) {
    profile.excluded_roles = [];
  }
  res.json(profile);
});

const saveUserProfileHandler = async (req: any, res: any) => {
  try {
    // Test-only delay is opt-in and applied inside writeTable's serialized queue.
    const rawTestDelay = req.headers['x-test-delay'];
    const parsedTestDelay = typeof rawTestDelay === 'string' ? Number(rawTestDelay) : 0;
    const testDelayEnabled = (process.env.NODE_ENV === 'test' || fs.existsSync(path.join(DATA_DIR, '.test-mode')) || fs.existsSync('.test-mode')) && req.headers['x-test-secret'] === 'super-secret-test';
    const queuedDelayMs = testDelayEnabled && Number.isInteger(parsedTestDelay)
      ? Math.max(0, Math.min(parsedTestDelay, 5000))
      : 0;

    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, error: 'Données de profil invalides' });
    }

    let updatedProfile: any = null;
    const mutateRes = await mutateTable('user_profile', (current) => {
      const currentProfile = current[0] || {};
      updatedProfile = {
        ...currentProfile,
        ...req.body,
        excluded_roles: Array.isArray(req.body.excluded_roles)
          ? req.body.excluded_roles
          : (Array.isArray(currentProfile.excluded_roles) ? currentProfile.excluded_roles : [])
      };
      return [updatedProfile];
    }, queuedDelayMs);

    if (!mutateRes.success || !updatedProfile) {
      return res.status(500).json({ success: false, error: 'Erreur lors de la persistance du profil sur le serveur' });
    }

    try {
      const settings = readTable('settings')[0] || {};
      await mutateTable('jobs', (currentJobs) => {
        return currentJobs.map((job: any) => ({
          ...job,
          score: calculateJobScore(job, updatedProfile, settings)
        }));
      });
    } catch (scoreErr) {
      console.warn('Avertissement lors du recalcul des scores des offres:', scoreErr);
    }

    res.json({
      success: true,
      saved_at: new Date().toISOString(),
      ...(testDelayEnabled ? { test_delay_applied_ms: queuedDelayMs } : {})
    });
  } catch (err: any) {
    console.error('Erreur inattendue dans sauvegarde /api/profile:', err);
    res.status(500).json({ success: false, error: err.message || 'Erreur serveur interne' });
  }
};

router.put('/api/profile', saveUserProfileHandler);
router.post('/api/profile', saveUserProfileHandler);

// Endpoint d'exclusion rapide de poste (« Pas intéressé »)
router.post('/api/profile/exclude-role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role || typeof role !== 'string' || !role.trim()) {
      return res.status(400).json({ success: false, error: 'Intitulé de poste manquant ou invalide' });
    }
    const cleanRole = role.trim();
    let alreadyExisted = false;
    let updatedProfile: any = null;

    const mutateRes = await mutateTable('user_profile', (current) => {
      const prof = current[0] || {};
      const roles = Array.isArray(prof.excluded_roles) ? [...prof.excluded_roles] : [];
      if (roles.some(r => r.toLowerCase() === cleanRole.toLowerCase())) {
        alreadyExisted = true;
      } else {
        roles.push(cleanRole);
      }
      updatedProfile = { ...prof, excluded_roles: roles };
      return [updatedProfile];
    });

    if (!mutateRes.success || !updatedProfile) {
      return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du profil' });
    }

    res.json({
      success: true,
      already_existed: alreadyExisted,
      message: alreadyExisted ? 'règle déjà présente' : undefined,
      excluded_role: cleanRole,
      excluded_roles: updatedProfile.excluded_roles,
      profile: updatedProfile
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erreur interne' });
  }
});

// Endpoint d'annulation d'exclusion de poste
router.post('/api/profile/unexclude-role', async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ success: false, error: 'Intitulé de poste manquant' });
    }
    const target = role.trim().toLowerCase();
    let updatedProfile: any = null;

    const mutateRes = await mutateTable('user_profile', (current) => {
      const prof = current[0] || {};
      const roles = Array.isArray(prof.excluded_roles)
        ? prof.excluded_roles.filter((r: string) => r.toLowerCase() !== target)
        : [];
      updatedProfile = { ...prof, excluded_roles: roles };
      return [updatedProfile];
    });

    if (!mutateRes.success || !updatedProfile) {
      return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du profil' });
    }

    res.json({
      success: true,
      unexcluded_role: role.trim(),
      excluded_roles: updatedProfile.excluded_roles,
      profile: updatedProfile
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Erreur interne' });
  }
});

// CV upload endpoint
router.post('/api/profile/upload-cv', async (req, res) => {
  try {
    const { filename, base64_content } = req.body;
    if (!filename || !base64_content) {
      return res.status(400).json({ error: 'Nom de fichier ou contenu base64 manquant.' });
    }
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(UPLOADS_DIR, safeName);
    const buffer = Buffer.from(base64_content, 'base64');
    fs.writeFileSync(targetPath, buffer);

    let parsed: any = null;
    if (safeName.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfData = await pdfParse(buffer);
        if (pdfData && pdfData.text && pdfData.text.trim().length > 20) {
          parsed = parseCvText(pdfData.text);
        }
      } catch (pdfErr) {
        console.warn('Erreur lors de l’analyse automatique du PDF uploadé:', pdfErr);
      }
    }

    let updatedProfile: any = null;
    await mutateTable('user_profile', (current) => {
      const p = current[0] || {};
      p.cv_filename = safeName;
      p.cv_path = targetPath;
      if (parsed) {
        if (parsed.first_name) p.first_name = parsed.first_name;
        if (parsed.last_name) p.last_name = parsed.last_name;
        if (parsed.current_title) p.current_title = parsed.current_title;
        if (parsed.email) p.email = parsed.email;
        if (parsed.phone) p.phone = parsed.phone;
        if (parsed.city) p.city = parsed.city;
        if (parsed.languages) p.languages = parsed.languages;
        if (Array.isArray(parsed.skills) && parsed.skills.length > 0) {
          p.skills = Array.from(new Set([...(p.skills || []), ...parsed.skills]));
        }
        if (Array.isArray(parsed.experiences) && parsed.experiences.length > 0) {
          p.experiences = parsed.experiences;
        }
        if (Array.isArray(parsed.formations) && parsed.formations.length > 0) {
          p.formations = parsed.formations;
        }
      }
      updatedProfile = { ...p };
      return [p];
    });

    res.json({ success: true, filename: safeName, path: targetPath, profile: updatedProfile });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors du téléversement du CV' });
  }
});

// Génération automatique d'un CV PDF officiel depuis le texte collé
router.post('/api/profile/generate-cv-from-text', async (req, res) => {
  try {
    const { cv_text } = req.body;
    if (!cv_text || typeof cv_text !== 'string' || cv_text.trim().length === 0) {
      return res.status(400).json({ error: 'Veuillez coller le texte de votre CV.' });
    }

    const parsed = parseCvText(cv_text);
    let updatedProfile: any = null;

    await mutateTable('user_profile', (current) => {
      const prev = current[0] || {};
      updatedProfile = {
        ...prev,
        first_name: parsed.first_name || prev.first_name || 'Jean',
        last_name: parsed.last_name || prev.last_name || 'Desfontaines',
        current_title: parsed.current_title || prev.current_title || 'Account Executive',
        email: parsed.email || prev.email || '',
        phone: parsed.phone || prev.phone || '',
        city: parsed.city || prev.city || 'Genève',
        canton: prev.canton || 'GE',
        swiss_permit: prev.swiss_permit || 'Permis B (Séjour avec travail)',
        skills: Array.from(new Set([...(prev.skills || []), ...(parsed.skills || [])])),
        languages: parsed.languages || prev.languages || '',
        experiences: parsed.experiences && parsed.experiences.length > 0 ? parsed.experiences : prev.experiences,
        formations: parsed.formations && parsed.formations.length > 0 ? parsed.formations : prev.formations,
      };

      return [updatedProfile];
    });

    // Génération physique du PDF A4 suisse
    const safeBase = `${updatedProfile.first_name || 'cv'}_${updatedProfile.last_name || 'candidat'}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const filename = `cv_${safeBase}.pdf`;
    const targetPath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const pdfBytes = await generateCvPdfBuffer(updatedProfile);
    fs.writeFileSync(targetPath, Buffer.from(pdfBytes));

    // Mémorisation du fichier CV actif
    await mutateTable('user_profile', (current) => {
      const p = current[0] || {};
      p.cv_filename = filename;
      p.cv_path = targetPath;
      return [p];
    });

    updatedProfile.cv_filename = filename;
    updatedProfile.cv_path = targetPath;

    res.json({
      success: true,
      filename,
      profile: updatedProfile
    });
  } catch (err: any) {
    console.error('Erreur génération CV depuis texte :', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la création du CV.' });
  }
});

// Régénération du PDF à partir du profil existant
router.post('/api/profile/regenerate-pdf', async (_req, res) => {
  try {
    const profile = readTable('user_profile')[0] || {};
    const safeBase = `${profile.first_name || 'cv'}_${profile.last_name || 'candidat'}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
    const filename = `cv_${safeBase}.pdf`;
    const targetPath = path.join(UPLOADS_DIR, filename);

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const pdfBytes = await generateCvPdfBuffer(profile);
    fs.writeFileSync(targetPath, Buffer.from(pdfBytes));

    await mutateTable('user_profile', (current) => {
      const p = current[0] || {};
      p.cv_filename = filename;
      p.cv_path = targetPath;
      return [p];
    });

    res.json({ success: true, filename });
  } catch (err: any) {
    console.error('Erreur régénération PDF :', err);
    res.status(500).json({ error: err.message || 'Erreur lors de la régénération du PDF.' });
  }
});

export default router;
