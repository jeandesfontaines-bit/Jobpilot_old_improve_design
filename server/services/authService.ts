import crypto from 'node:crypto';
import express from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE = 'jp_session';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export const isProduction = () => process.env.NODE_ENV === 'production';
const getPassword = () => process.env.APP_PASSWORD || '';
const getSecret = () => process.env.SESSION_SECRET || getPassword();

/** En production, le serveur refuse de démarrer sans mot de passe suffisamment long. */
export function checkAuthEnv(): void {
  if (!isProduction()) return;
  if (getPassword().length < MIN_PASSWORD_LENGTH) {
    console.error(
      `CRITICAL: APP_PASSWORD est obligatoire en production (au moins ${MIN_PASSWORD_LENGTH} caractères).`
    );
    process.exit(1);
  }
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Jeton de session : « expiration.signature ». Impossible à fabriquer sans la clé secrète. */
export function createSessionToken(now: number = Date.now()): string {
  const expires = String(now + SESSION_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

export function verifySessionToken(token: string | undefined, now: number = Date.now()): boolean {
  if (!token || !getSecret()) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expires, signature] = parts;
  if (!/^\d+$/.test(expires)) return false;
  const expected = Buffer.from(sign(expires), 'hex');
  const given = Buffer.from(signature, 'hex');
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;
  return Number(expires) > now;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function isAuthenticated(req: Request): boolean {
  return verifySessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
}

/** Comparaison à temps constant (via hachage SHA-256 des deux valeurs). */
export function verifyPassword(input: unknown): boolean {
  const expected = getPassword();
  if (typeof input !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Limitation des tentatives de connexion (en mémoire, par adresse IP) ──
const failures = new Map<string, { count: number; first: number; blockUntil: number }>();

export function isBlocked(ip: string, now: number = Date.now()): boolean {
  const entry = failures.get(ip);
  return Boolean(entry && entry.blockUntil > now);
}

export function recordFailure(ip: string, now: number = Date.now()): void {
  let entry = failures.get(ip);
  if (!entry || now - entry.first > FAILURE_WINDOW_MS) {
    entry = { count: 0, first: now, blockUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.blockUntil = now + BLOCK_MS;
  }
  failures.set(ip, entry);
}

export function resetRateLimit(ip: string): void {
  failures.delete(ip);
}

export function resetAllRateLimits(): void {
  failures.clear();
}

function loginPage(message?: string): string {
  const notice = message ? `<p class="notice">${message}</p>` : '';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JobPilot — Connexion</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fafafa;font-family:system-ui,sans-serif;color:#18181b}
form{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;width:320px;display:flex;flex-direction:column;gap:12px}
h1{font-size:18px;margin:0 0 4px}
input{padding:10px 12px;border:1px solid #d4d4d8;border-radius:8px;font-size:14px}
button{padding:10px 12px;border:0;border-radius:8px;background:#dc2626;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
.notice{margin:0;font-size:13px;color:#b91c1c}
</style>
</head>
<body>
<form action="/login" method="POST">
<h1>JobPilot</h1>
${notice}
<input type="password" name="password" placeholder="Mot de passe" autocomplete="current-password" autofocus required>
<button type="submit">Connexion</button>
</form>
</body>
</html>`;
}

function cookieOptions() {
  return { httpOnly: true, sameSite: 'strict' as const, secure: isProduction(), path: '/' };
}

/** Routes publiques : /login (page + validation) et /logout. À enregistrer AVANT authGate. */
export function registerAuthRoutes(app: Express): void {
  // Derrière Cloud Run, req.ip doit être l'adresse du visiteur et non celle du proxy.
  app.set('trust proxy', 1);

  app.get('/login', (req: Request, res: Response) => {
    if (!isProduction() || isAuthenticated(req)) {
      res.redirect('/');
      return;
    }
    res.status(200).type('html').send(loginPage());
  });

  app.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), (req: Request, res: Response) => {
    if (!isProduction()) {
      res.redirect('/');
      return;
    }
    const ip = req.ip || 'unknown';
    if (isBlocked(ip)) {
      res.status(429).type('html').send(loginPage('Trop de tentatives. Réessaie dans 10 minutes.'));
      return;
    }
    if (verifyPassword(req.body?.password)) {
      resetRateLimit(ip);
      res.cookie(SESSION_COOKIE, createSessionToken(), { ...cookieOptions(), maxAge: SESSION_TTL_MS });
      res.redirect('/');
      return;
    }
    recordFailure(ip);
    res.status(401).type('html').send(loginPage('Mot de passe incorrect.'));
  });

  app.post('/logout', (_req: Request, res: Response) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.redirect('/login');
  });
}

/**
 * Verrou global (production uniquement) : sans session valide, les pages sont redirigées
 * vers /login et tout le reste (API, fichiers, autres méthodes) reçoit 401.
 */
export function authGate(req: Request, res: Response, next: NextFunction): void {
  if (!isProduction()) {
    next();
    return;
  }
  if (isAuthenticated(req)) {
    next();
    return;
  }
  const isApi = req.path === '/api' || req.path.startsWith('/api/');
  const wantsJson = (req.headers.accept || '').includes('application/json');
  if (isApi || wantsJson || req.method !== 'GET') {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }
  res.redirect('/login');
}
