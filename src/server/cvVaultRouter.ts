import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
interface CvRecord { id: string; name: string; filename: string; createdAt: string; bytes: number; }
export function createCvVaultRouter(root: string) {
  const router = Router();
  const directory = path.resolve(root, 'cv-vault');
  fs.mkdirSync(directory, { recursive: true });
  const indexFile = path.join(directory, 'index.json');
  function read(): CvRecord[] {
    if (!fs.existsSync(indexFile)) return [];
    const value = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    if (!Array.isArray(value)) throw new Error('Index CV invalide');
    return value;
  }
  function write(records: CvRecord[]) {
    const temporary = `${indexFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, indexFile);
  }
  router.get('/', (_req, res) => {
    try { res.json(read().map(cv => ({ ...cv, previewUrl: `/api/cvs/${cv.id}/file`, downloadUrl: `/api/cvs/${cv.id}/file?download=1` }))); }
    catch { res.status(500).json({ error: 'Lecture de la bibliothèque CV impossible' }); }
  });
  router.post('/', (req, res) => {
    const { name, base64_content } = req.body || {};
    if (typeof base64_content !== 'string' || !base64_content || base64_content.length > 14000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64_content)) {
      res.status(400).json({ error: 'PDF encodé en base64 requis, taille maximale 10 Mo' }); return;
    }
    const buffer = Buffer.from(base64_content, 'base64');
    if (buffer.length > 10 * 1024 * 1024 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      res.status(400).json({ error: 'Fichier PDF valide requis, taille maximale 10 Mo' }); return;
    }
    const id = randomUUID();
    const filePath = path.join(directory, `${id}.pdf`);
    const record: CvRecord = { id, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 160) : 'CV importé', filename: `${id}.pdf`, createdAt: new Date().toISOString(), bytes: buffer.length };
    try {
      fs.writeFileSync(filePath, buffer, { flag: 'wx', mode: 0o600 });
      write([record, ...read()]);
      res.status(201).json(record);
    } catch {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      res.status(500).json({ error: 'Enregistrement du CV impossible' });
    }
  });
  router.get('/:id/file', (req, res) => {
    try {
      const record = read().find(cv => cv.id === req.params.id);
      if (!record) { res.status(404).json({ error: 'CV introuvable' }); return; }
      const filePath = path.join(directory, `${record.id}.pdf`);
      if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Fichier CV absent' }); return; }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const complete = (error?: Error) => { if (error && !res.headersSent) res.status(500).end(); };
      if (req.query.download === '1') res.download(filePath, `${record.name.replace(/[^a-zA-Z0-9 _-]/g, '_') || 'CV'}.pdf`, complete);
      else { res.type('application/pdf'); res.sendFile(filePath, complete); }
    } catch { if (!res.headersSent) res.status(500).json({ error: 'Ouverture du CV impossible' }); }
  });
  return router;
}
