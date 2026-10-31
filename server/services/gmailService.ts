import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * Ensemble des permissions Gmail OAuth 2.0 demandées par défaut :
 * lecture, rédaction et gestion des brouillons, envoi, gestion des libellés/messages et paramètres.
 */
export const GMAIL_DEFAULT_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing'
];

export const GMAIL_SCOPES_STRING = GMAIL_DEFAULT_SCOPES.join(' ');

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenPath: string;
  scopes: string[];
}

export interface StoredGmailTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
  email?: string;
  updated_at: string;
}

export interface ActivationEmailSearchOptions {
  /** Domaine attendu de l'expéditeur et du lien d'activation (ex: "emploi.lasource.ch" ou "lasource.ch") */
  expectedDomain: string;
  /** Adresse destinataire attendue (ex: "jean.desfontaines@gmail.com") */
  recipientEmail?: string;
  /** Horodatage minimum (ms) de réception du message */
  afterTimestampMs?: number;
  /** Mots-clés optionnels dans l'objet ou le corps */
  keywords?: string[];
}

export interface ActivationEmailResult {
  found: boolean;
  messageId?: string;
  subject?: string;
  from?: string;
  date?: string;
  activationUrl?: string;
  reason?: string;
}

const SCOPE_LABELS_FR: Record<string, string> = {
  'https://mail.google.com/': 'Accès complet à la boîte Gmail (lecture, brouillons, envoi, gestion complète)',
  'https://www.googleapis.com/auth/gmail.modify': 'Lecture, rédaction, envoi et modification des e-mails',
  'https://www.googleapis.com/auth/gmail.compose': 'Rédaction, gestion des brouillons et envoi d’e-mails',
  'https://www.googleapis.com/auth/gmail.readonly': 'Lecture des e-mails et paramètres',
  'https://www.googleapis.com/auth/gmail.send': 'Envoi d’e-mails',
  'https://www.googleapis.com/auth/gmail.insert': 'Insertion d’e-mails dans la boîte',
  'https://www.googleapis.com/auth/gmail.labels': 'Consultation et gestion des libellés',
  'https://www.googleapis.com/auth/gmail.settings.basic': 'Gestion des paramètres et filtres de base',
  'https://www.googleapis.com/auth/gmail.settings.sharing': 'Gestion des paramètres de partage et transfert'
};

export function parseScopeList(scopeStr: string | undefined | null): string[] {
  if (!scopeStr) return [];
  return scopeStr
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function describeGmailScopesFr(scopes: string[]): string[] {
  return scopes.map((s) => SCOPE_LABELS_FR[s] || s);
}

// Stockage éphémère en mémoire des états CSRF OAuth (TTL 15 minutes)
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 15 * 60 * 1000;

export function getGmailOAuthConfig(): GmailOAuthConfig {
  let fileEnv: Record<string, string> = {};
  const envFilePath = path.resolve(process.cwd(), '.env');
  try {
    if (fs.existsSync(envFilePath)) {
      fileEnv = dotenv.parse(fs.readFileSync(envFilePath, 'utf-8'));
    }
  } catch {
    // Ignore read errors
  }

  const port = process.env.NODE_ENV === 'production' ? (process.env.PORT || 8080) : 3000;
  const clientId = (process.env.GOOGLE_CLIENT_ID || fileEnv.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || fileEnv.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = (
    process.env.GOOGLE_REDIRECT_URI ||
    fileEnv.GOOGLE_REDIRECT_URI ||
    `http://localhost:${port}/api/auth/gmail/callback`
  ).trim();
  const tokenPath = (
    process.env.GMAIL_TOKEN_PATH ||
    fileEnv.GMAIL_TOKEN_PATH ||
    path.resolve(process.cwd(), '.env.gmail-token.json')
  ).trim();
  const customScopesRaw = (process.env.GOOGLE_OAUTH_SCOPES || fileEnv.GOOGLE_OAUTH_SCOPES || '').trim();
  const scopes = customScopesRaw ? parseScopeList(customScopesRaw) : [...GMAIL_DEFAULT_SCOPES];

  return { clientId, clientSecret, redirectUri, tokenPath, scopes };
}

export function isGmailOAuthConfigured(config = getGmailOAuthConfig()): boolean {
  return Boolean(
    config.clientId &&
      config.clientSecret &&
      config.clientId !== 'MY_GOOGLE_CLIENT_ID' &&
      config.clientSecret !== 'MY_GOOGLE_CLIENT_SECRET'
  );
}

export function createOAuthState(now = Date.now()): string {
  for (const [key, exp] of pendingStates.entries()) {
    if (exp <= now) pendingStates.delete(key);
  }
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

export function consumeOAuthState(state: string | undefined, now = Date.now()): boolean {
  if (!state) return false;
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (!exp || exp <= now) return false;
  return true;
}

export function buildGmailAuthUrl(options?: {
  loginHint?: string;
  state?: string;
  scopes?: string[];
  config?: GmailOAuthConfig;
}): { url: string; state: string; scopes: string[] } {
  const cfg = options?.config || getGmailOAuthConfig();
  if (!isGmailOAuthConfigured(cfg)) {
    throw new Error('Identifiants OAuth Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) non configurés dans .env');
  }
  const state = options?.state || createOAuthState();
  const requestedScopes = options?.scopes && options.scopes.length > 0
    ? options.scopes
    : (cfg.scopes && cfg.scopes.length > 0 ? cfg.scopes : GMAIL_DEFAULT_SCOPES);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: requestedScopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  if (options?.loginHint) {
    params.set('login_hint', options.loginHint);
  }
  return {
    url: `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`,
    state,
    scopes: requestedScopes
  };
}

export function readStoredGmailTokens(config = getGmailOAuthConfig()): StoredGmailTokens | null {
  try {
    if (!fs.existsSync(config.tokenPath)) return null;
    const raw = fs.readFileSync(config.tokenPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.access_token !== 'string') return null;
    return parsed as StoredGmailTokens;
  } catch {
    return null;
  }
}

export function writeStoredGmailTokens(tokens: StoredGmailTokens, config = getGmailOAuthConfig()): void {
  const dir = path.dirname(config.tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.tokenPath, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export async function exchangeCodeForGmailTokens(
  code: string,
  config = getGmailOAuthConfig(),
  fetchFn: typeof fetch = fetch
): Promise<{ email?: string; scope: string; grantedScopes: string[] }> {
  if (!isGmailOAuthConfigured(config)) {
    throw new Error('Configuration OAuth Google manquante.');
  }

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  });

  const tokenRes = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!tokenRes.ok) {
    throw new Error(`Échec de l'échange du code OAuth Google (HTTP ${tokenRes.status}).`);
  }

  const tokenData: any = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error('Réponse OAuth Google invalide (access_token manquant).');
  }

  const existing = readStoredGmailTokens(config);
  const expiresInSec = Number(tokenData.expires_in || 3600);
  const grantedScopeStr = typeof tokenData.scope === 'string' && tokenData.scope.trim()
    ? tokenData.scope.trim()
    : (config.scopes || GMAIL_DEFAULT_SCOPES).join(' ');

  const stored: StoredGmailTokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || existing?.refresh_token,
    scope: grantedScopeStr,
    token_type: tokenData.token_type || 'Bearer',
    expiry_date: Date.now() + expiresInSec * 1000,
    updated_at: new Date().toISOString()
  };

  // Récupération de l'adresse e-mail du profil Gmail
  try {
    const profileRes = await fetchFn(`${GMAIL_API_BASE}/profile`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${stored.access_token}` }
    });
    if (profileRes.ok) {
      const profileData: any = await profileRes.json();
      if (typeof profileData.emailAddress === 'string') {
        stored.email = profileData.emailAddress;
      }
    }
  } catch {
    // Non bloquant
  }

  writeStoredGmailTokens(stored, config);
  return {
    email: stored.email,
    scope: stored.scope,
    grantedScopes: parseScopeList(stored.scope)
  };
}

export async function getValidGmailAccessToken(
  config = getGmailOAuthConfig(),
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const stored = readStoredGmailTokens(config);
  if (!stored) {
    throw new Error('Aucun jeton Gmail enregistré. Connectez d’abord Gmail via /api/auth/gmail/connect.');
  }

  // Marge de 60 secondes avant expiration
  if (stored.expiry_date && stored.expiry_date > Date.now() + 60_000) {
    return stored.access_token;
  }

  if (!stored.refresh_token) {
    throw new Error('Le jeton Gmail a expiré et aucun refresh_token n’est disponible. Reconnectez Gmail.');
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: stored.refresh_token,
    grant_type: 'refresh_token'
  });

  const refreshRes = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!refreshRes.ok) {
    throw new Error(`Échec du rafraîchissement du jeton Gmail (HTTP ${refreshRes.status}).`);
  }

  const refreshData: any = await refreshRes.json();
  if (!refreshData.access_token) {
    throw new Error('Réponse de rafraîchissement OAuth invalide.');
  }

  const updated: StoredGmailTokens = {
    ...stored,
    access_token: refreshData.access_token,
    scope: typeof refreshData.scope === 'string' && refreshData.scope.trim() ? refreshData.scope.trim() : stored.scope,
    expiry_date: Date.now() + Number(refreshData.expires_in || 3600) * 1000,
    updated_at: new Date().toISOString()
  };
  writeStoredGmailTokens(updated, config);
  return updated.access_token;
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

/**
 * Vérifie que l'URL d'activation extraite d'un e-mail pointe bien vers le domaine attendu en HTTPS.
 */
export function isAllowedActivationUrl(rawUrl: string, expectedDomain: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const target = normalizeDomain(expectedDomain);
    if (!target) return false;
    return host === target || host.endsWith(`.${target}`);
  } catch {
    return false;
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function extractBodyTextFromPayload(payload: any): string {
  if (!payload) return '';
  const parts: string[] = [];

  if (payload.body?.data) {
    parts.push(decodeBase64Url(payload.body.data));
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      parts.push(extractBodyTextFromPayload(part));
    }
  }
  return parts.join('\n');
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extrait les liens d'activation candidats depuis le corps d'un e-mail et filtre strictement par domaine attendu.
 */
export function extractVerifiedActivationLinks(body: string, expectedDomain: string): string[] {
  const decoded = decodeHtmlEntities(body);
  const urlRegex = /https:\/\/[^\s"'<>)\]]+/gi;
  const matches = decoded.match(urlRegex) || [];
  const validUrls: string[] = [];

  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;!?]+$/, '');
    if (!isAllowedActivationUrl(cleaned, expectedDomain)) continue;
    if (!validUrls.includes(cleaned)) {
      validUrls.push(cleaned);
    }
  }

  // Prioriser les liens contenant des paramètres d'activation / validation / clé / compte
  validUrls.sort((a, b) => {
    const score = (u: string) => {
      const lower = u.toLowerCase();
      let s = 0;
      if (/(valid|activ|confirm|check|token|key|code|account|login|hash|id=)/i.test(lower)) s += 5;
      if (lower.includes('?')) s += 2;
      return s;
    };
    return score(b) - score(a);
  });

  return validUrls;
}

export function buildActivationSearchQuery(options: ActivationEmailSearchOptions): string {
  const domain = normalizeDomain(options.expectedDomain);
  if (!domain) {
    throw new Error('expectedDomain est obligatoire pour restreindre la recherche d’e-mail d’activation.');
  }
  const rootDomain = domain.split('.').slice(-2).join('.');
  const queryParts: string[] = [`from:${rootDomain}`];

  if (options.recipientEmail) {
    queryParts.push(`to:${options.recipientEmail.trim()}`);
  }
  queryParts.push('newer_than:2d');

  return queryParts.join(' ');
}

/**
 * Recherche uniquement l'e-mail d'activation correspondant à l'inscription en cours.
 * Aucun envoi, déplacement, marquage ou suppression d'e-mail n'est effectué.
 */
export async function findActivationEmailLink(
  options: ActivationEmailSearchOptions,
  config = getGmailOAuthConfig(),
  fetchFn: typeof fetch = fetch
): Promise<ActivationEmailResult> {
  const accessToken = await getValidGmailAccessToken(config, fetchFn);
  const q = buildActivationSearchQuery(options);

  const listUrl = `${GMAIL_API_BASE}/messages?${new URLSearchParams({ q, maxResults: '5' }).toString()}`;
  const listRes = await fetchFn(listUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!listRes.ok) {
    throw new Error(`Erreur lors de la recherche Gmail (HTTP ${listRes.status}).`);
  }

  const listData: any = await listRes.json();
  const messages: Array<{ id: string }> = Array.isArray(listData.messages) ? listData.messages : [];

  if (messages.length === 0) {
    return {
      found: false,
      reason: `Aucun e-mail récent trouvé pour la requête restreinte « ${q} ».`
    };
  }

  for (const msgRef of messages) {
    const msgUrl = `${GMAIL_API_BASE}/messages/${encodeURIComponent(msgRef.id)}?format=full`;
    const msgRes = await fetchFn(msgUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!msgRes.ok) continue;

    const msgData: any = await msgRes.json();
    const internalDateMs = Number(msgData.internalDate || 0);
    if (options.afterTimestampMs && internalDateMs && internalDateMs < options.afterTimestampMs - 60_000) {
      continue;
    }

    const headers: Array<{ name: string; value: string }> = msgData.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject');
    const from = getHeader('From');
    const date = getHeader('Date');
    const bodyText = extractBodyTextFromPayload(msgData.payload) || msgData.snippet || '';

    const links = extractVerifiedActivationLinks(bodyText, options.expectedDomain);
    if (links.length > 0) {
      return {
        found: true,
        messageId: msgRef.id,
        subject,
        from,
        date,
        activationUrl: links[0]
      };
    }
  }

  return {
    found: false,
    reason: `Message(s) trouvé(s) pour « ${q} », mais aucun lien HTTPS pointant vers « ${options.expectedDomain} » n'a été détecté.`
  };
}
