import { Router } from 'express';
import {
  getGmailOAuthConfig,
  isGmailOAuthConfigured,
  buildGmailAuthUrl,
  consumeOAuthState,
  exchangeCodeForGmailTokens,
  readStoredGmailTokens,
  findActivationEmailLink,
  parseScopeList,
  describeGmailScopesFr
} from '../services/gmailService.ts';

const router = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Statut de la configuration et de la connexion Gmail OAuth (sans jamais exposer de secret ni de jeton).
 */
router.get('/api/auth/gmail/status', (_req, res) => {
  const cfg = getGmailOAuthConfig();
  const configured = isGmailOAuthConfigured(cfg);
  const stored = readStoredGmailTokens(cfg);
  const grantedScopes = parseScopeList(stored?.scope);
  const grantedCapabilities = describeGmailScopesFr(grantedScopes);

  res.json({
    configured,
    connected: Boolean(stored?.access_token),
    email: stored?.email || null,
    redirectUri: cfg.redirectUri,
    requestedScopes: cfg.scopes,
    grantedScopes,
    grantedCapabilities,
    scope: stored?.scope || cfg.scopes.join(' '),
    updatedAt: stored?.updated_at || null
  });
});

/**
 * Démarre le flux OAuth 2.0 Google avec les autorisations Gmail configurées (redirection ou JSON si ?format=json).
 */
router.get('/api/auth/gmail/connect', (req, res) => {
  try {
    const loginHint = typeof req.query.login_hint === 'string' ? req.query.login_hint.trim() : undefined;
    const { url, scopes } = buildGmailAuthUrl({ loginHint });
    if (req.query.format === 'json') {
      res.json({ authUrl: url, requestedScopes: scopes, scope: scopes.join(' ') });
      return;
    }
    res.redirect(url);
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Impossible d’initialiser la connexion OAuth Gmail.'
    });
  }
});

/**
 * Callback OAuth 2.0 Google : vérifie le paramètre CSRF state, échange le code contre un jeton stocké hors Git
 * et affiche les autorisations réellement accordées par Google.
 */
router.get('/api/auth/gmail/callback', async (req, res) => {
  const errorParam = typeof req.query.error === 'string' ? req.query.error : '';
  if (errorParam) {
    res.status(400).type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>JobPilot — Autorisation Gmail annulée</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto">
  <h2>Autorisation Gmail refusée ou annulée</h2>
  <p>Motif retourné par Google : <code>${escapeHtml(errorParam)}</code></p>
</body></html>`);
    return;
  }

  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;

  if (!consumeOAuthState(state)) {
    res.status(400).type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>JobPilot — État OAuth invalide</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto">
  <h2>État OAuth invalide ou expiré</h2>
  <p>Relancez la connexion depuis <code>/api/auth/gmail/connect</code>.</p>
</body></html>`);
    return;
  }

  if (!code) {
    res.status(400).type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>JobPilot — Code OAuth manquant</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto">
  <h2>Code d’autorisation OAuth manquant</h2>
</body></html>`);
    return;
  }

  try {
    const result = await exchangeCodeForGmailTokens(code);
    const safeEmail = escapeHtml(result.email || 'Compte Gmail connecté');
    const capabilities = describeGmailScopesFr(result.grantedScopes);
    const capabilitiesHtml = capabilities
      .map((label, idx) => `<li><strong>${escapeHtml(label)}</strong><br><code style="font-size:12px;color:#52525b">${escapeHtml(result.grantedScopes[idx] || '')}</code></li>`)
      .join('');

    res.status(200).type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>JobPilot — Gmail connecté</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto;line-height:1.5">
  <h2 style="color:#15803d">Connexion Gmail établie</h2>
  <p>Compte autorisé : <strong>${safeEmail}</strong></p>
  <p>Autorisations Gmail réellement accordées (${result.grantedScopes.length}) :</p>
  <ul style="display:flex;flex-direction:column;gap:8px">${capabilitiesHtml}</ul>
  <p>Vous pouvez fermer cet onglet et revenir à JobPilot.</p>
</body></html>`);
  } catch (err: any) {
    const safeMsg = escapeHtml(String(err.message || 'Erreur lors de la finalisation OAuth'));
    res.status(500).type('html').send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>JobPilot — Erreur OAuth Gmail</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto">
  <h2 style="color:#b91c1c">Échec de la connexion Gmail</h2>
  <p>${safeMsg}</p>
</body></html>`);
  }
});

/**
 * Recherche restreinte d'un e-mail d'activation pour le domaine d'inscription en cours.
 */
router.post('/api/auth/gmail/activation-link', async (req, res) => {
  try {
    const { expectedDomain, recipientEmail, afterTimestampMs } = req.body || {};
    if (!expectedDomain || typeof expectedDomain !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Le paramètre expectedDomain est requis (ex: "emploi.lasource.ch").'
      });
      return;
    }

    const result = await findActivationEmailLink({
      expectedDomain,
      recipientEmail: typeof recipientEmail === 'string' ? recipientEmail : undefined,
      afterTimestampMs: typeof afterTimestampMs === 'number' ? afterTimestampMs : undefined
    });

    res.json({
      success: result.found,
      ...result
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Erreur lors de la recherche de l’e-mail d’activation.'
    });
  }
});

export default router;
