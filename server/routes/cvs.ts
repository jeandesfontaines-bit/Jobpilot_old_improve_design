/**
 * Routes Bibliothèque CV — Gestion des fichiers PDF de candidature.
 * GET  /api/cvs          — liste tous les CVs disponibles
 * POST /api/cvs          — importe un nouveau CV (base64)
 * GET  /api/cvs/:id/file — sert le fichier PDF (download ou aperçu)
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR, mutateTable, readTable } from '../db.ts';
import { ensureAndGetBaseAtsCv } from '../../src/services/automationAgent.ts';

const router = Router();

/** Renvoie un id stable et URL-safe à partir d'un nom de fichier */
function nameToId(filename: string): string {
  return filename.replace(/\.pdf$/i, '');
}

/** Renvoie le chemin complet du fichier PDF correspondant à un id */
function idToPath(id: string): string {
  return path.join(UPLOADS_DIR, `${id}.pdf`);
}

// ── GET /api/cvs ──────────────────────────────────────────────────────────────
// Liste tous les PDFs dans le dossier uploads/, triés du plus récent au plus ancien
router.get('/api/cvs', (_req, res) => {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      return res.json([]);
    }

    const profile = readTable('user_profile')[0] || {};
    const baseCv = profile.cv_filename || '';
    const baseAtsCv = profile.base_ats_cv_filename || '';

    // Chargement de la table des métadonnées de variantes
    const variants = readTable('cv_variants') || [];
    const variantMap = new Map<string, any>();
    for (const v of variants) {
      if (v.filename) variantMap.set(String(v.filename).toLowerCase(), v);
      if (v.id) variantMap.set(String(v.id).toLowerCase(), v);
    }

    const files = fs.readdirSync(UPLOADS_DIR)
      .filter(f => f.toLowerCase().endsWith('.pdf'))
      .map(f => {
        const fullPath = path.join(UPLOADS_DIR, f);
        const stat = fs.statSync(fullPath);
        const isBase = f === baseCv || f === path.basename(baseCv);
        const isBaseAts = Boolean(baseAtsCv && (f === baseAtsCv || f === path.basename(baseAtsCv)));
        
        // Liaison de données stricte avec la table cv_variants (pas de détection heuristique sur le nom)
        const variantMeta = variantMap.get(f.toLowerCase()) || variantMap.get(nameToId(f).toLowerCase()) || null;
        const isAdapted = Boolean(variantMeta);

        return {
          id: nameToId(f),
          name: nameToId(f),
          filename: f,
          isBase,
          isBaseAts,
          isAdapted,
          variant_meta: variantMeta ? {
            source_cv_filename: variantMeta.source_cv_filename,
            job_id: variantMeta.job_id,
            created_at: variantMeta.created_at,
            generator: variantMeta.generator,
            status: variantMeta.status || 'active',
            adaptation_summary: variantMeta.adaptation_summary
          } : null,
          createdAt: stat.mtime.toISOString(),
          bytes: stat.size,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(files);
  } catch (err: any) {
    console.error('[cvs] Erreur listage CVs :', err.message);
    res.status(500).json({ error: 'Impossible de lister les CVs.' });
  }
});

// ── POST /api/cvs ─────────────────────────────────────────────────────────────
// Importe un nouveau PDF (body: { name: string, base64_content: string })
router.post('/api/cvs', (req, res) => {
  try {
    const { name, base64_content } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Nom du CV manquant.' });
    }
    if (!base64_content || typeof base64_content !== 'string') {
      return res.status(400).json({ error: 'Contenu base64 manquant.' });
    }

    // Sécurisation du nom de fichier
    const safeName = name.trim()
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9._\-\u00C0-\u024F ]/g, '_')
      .trim()
      .replace(/\s+/g, '_');

    if (!safeName) {
      return res.status(400).json({ error: 'Nom de fichier invalide.' });
    }

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const targetPath = path.join(UPLOADS_DIR, `${safeName}.pdf`);
    const buffer = Buffer.from(base64_content, 'base64');

    // Vérification minimale que c'est bien un PDF (%PDF header)
    if (buffer.length < 4 || buffer.slice(0, 4).toString('ascii') !== '%PDF') {
      return res.status(400).json({ error: 'Le fichier n\'est pas un PDF valide.' });
    }

    fs.writeFileSync(targetPath, buffer);
    console.log(`[cvs] CV importé : ${safeName}.pdf (${Math.ceil(buffer.length / 1024)} Ko)`);

    res.json({
      success: true,
      id: safeName,
      name: safeName,
      bytes: buffer.length,
    });
  } catch (err: any) {
    console.error('[cvs] Erreur import CV :', err.message);
    res.status(500).json({ error: err.message || 'Erreur lors de l\'import du CV.' });
  }
});

// ── GET /api/cvs/base-ats/download ────────────────────────────────────────────
// Génère (si besoin), stocke et permet de télécharger le CV de base ATS-friendly
router.get('/api/cvs/base-ats/download', async (_req, res) => {
  try {
    const profile = readTable('user_profile')[0] || {};
    const { baseAtsFilename, baseAtsPath } = await ensureAndGetBaseAtsCv(profile);

    if (!fs.existsSync(baseAtsPath)) {
      return res.status(404).json({ error: 'CV de base ATS-friendly introuvable.' });
    }

    const stat = fs.statSync(baseAtsPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${baseAtsFilename}"`);
    fs.createReadStream(baseAtsPath).pipe(res);
  } catch (err: any) {
    console.error('[cvs] Erreur téléchargement CV de base ATS :', err.message);
    res.status(500).json({ error: err.message || 'Erreur lors de la génération ou lecture du CV de base ATS.' });
  }
});

// ── GET /api/cvs/:id/file ─────────────────────────────────────────────────────
// Sert le fichier PDF — ?download=1 pour forcer le téléchargement
router.get('/api/cvs/:id/file', (req, res) => {
  try {
    const { id } = req.params;
    const download = req.query.download === '1';

    // Sécurité : interdire les path traversal
    const safeid = path.basename(id);
    const filePath = idToPath(safeid);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `CV « ${safeid} » introuvable sur le serveur.` });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', stat.size);

    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeid}.pdf"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeid}.pdf"`);
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (err: any) {
    console.error('[cvs] Erreur lecture CV :', err.message);
    res.status(500).json({ error: 'Erreur lors de la lecture du fichier CV.' });
  }
});

// ── DELETE /api/cvs/:id ───────────────────────────────────────────────────────
// Supprime un CV de la bibliothèque
router.delete('/api/cvs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const safeid = path.basename(id);
    const filePath = idToPath(safeid);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `CV « ${safeid} » introuvable.` });
    }

    fs.unlinkSync(filePath);
    console.log(`[cvs] CV supprimé : ${safeid}.pdf`);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[cvs] Erreur suppression CV :', err.message);
    res.status(500).json({ error: err.message || 'Erreur lors de la suppression.' });
  }
});

// ── POST /api/cvs/:id/set-base ────────────────────────────────────────────────
// Définit ce CV comme CV de base actif dans le profil candidat avec vérification stricte
router.post('/api/cvs/:id/set-base', async (req, res) => {
  try {
    const { id } = req.params;
    const safeid = path.basename(id);
    const filename = `${safeid}.pdf`;
    const filePath = idToPath(safeid);

    // 1. Vérification physique immédiate de l'existence du fichier
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `Fichier CV introuvable ou supprimé : « ${filename} » à l'emplacement ${filePath}`
      });
    }

    // 2. Mutation atomique du profil avec vérification du contrat
    const mutateRes = await mutateTable('user_profile', (current) => {
      const p = current[0] || {};
      p.cv_filename = filename;
      p.cv_path = filePath;
      return [p];
    });

    if (!mutateRes.success) {
      return res.status(500).json({
        success: false,
        error: 'Échec de la mutation du profil utilisateur sur le stockage persistant.'
      });
    }

    // 3. Relecture indépendante et vérification stricte
    const reloadedProfile = readTable('user_profile')[0] || {};
    if (reloadedProfile.cv_filename !== filename) {
      return res.status(500).json({
        success: false,
        error: `Incohérence de persistance : cv_filename lu (${reloadedProfile.cv_filename}) diffère du fichier demandé (${filename}).`
      });
    }

    if (!reloadedProfile.cv_path || !fs.existsSync(reloadedProfile.cv_path)) {
      return res.status(500).json({
        success: false,
        error: `Incohérence de persistance : cv_path (${reloadedProfile.cv_path}) est introuvable sur le disque.`
      });
    }

    console.log(`[cvs] CV de base validé et synchronisé : ${filename}`);
    res.json({
      success: true,
      base_cv: filename,
      path: filePath,
      verified: true
    });
  } catch (err: any) {
    console.error('[cvs] Erreur sélection CV de base :', err.message);
    res.status(500).json({ success: false, error: err.message || 'Erreur lors de la sélection du CV de base.' });
  }
});

export default router;
