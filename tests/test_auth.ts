import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  registerAuthRoutes,
  authGate,
  createSessionToken,
  verifySessionToken,
  resetAllRateLimits,
  SESSION_COOKIE,
} from '../server/services/authService.ts';

// Les fonctions d'authentification lisent l'environnement à chaque appel : on simule la production ici.
process.env.NODE_ENV = 'production';
process.env.APP_PASSWORD = 'mot-de-passe-de-test-long';
process.env.SESSION_SECRET = 'secret-de-test-pour-hmac';

async function run() {
  console.log('=== TEST SUITE : Protection par mot de passe ===');

  const app = express();
  registerAuthRoutes(app);
  app.use(authGate);
  app.get('/api/profile', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/', (_req, res) => {
    res.send('app');
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;

  const login = (password: string) =>
    fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password }).toString(),
    });
  const get = (urlPath: string, cookie?: string) =>
    fetch(`${base}${urlPath}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });

  try {
    // 1. Sans cookie
    assert.equal((await get('/api/profile')).status, 401, 'Sans cookie, /api/profile doit répondre 401');
    console.log('  ✓ Sans cookie : API refusée (401)');

    const page = await get('/');
    assert.equal(page.status, 302, 'Sans cookie, la page doit rediriger');
    assert.equal(page.headers.get('location'), '/login', 'Redirection vers /login');
    console.log('  ✓ Sans cookie : la page est redirigée vers /login');

    assert.equal((await get('/login')).status, 200, 'La page de connexion est publique');
    console.log('  ✓ La page /login est accessible');

    // 2. Cookies forgés ou altérés
    assert.equal((await get('/api/profile', `${SESSION_COOKIE}=true`)).status, 401);
    assert.equal((await get('/api/profile', 'auth_session=true')).status, 401);
    console.log('  ✓ Cookies forgés (« true ») refusés');

    assert.equal(verifySessionToken('true'), false);
    const valid = createSessionToken();
    assert.equal(verifySessionToken(valid), true);
    const last = valid.slice(-1);
    const tampered = valid.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    assert.equal((await get('/api/profile', `${SESSION_COOKIE}=${tampered}`)).status, 401);
    console.log('  ✓ Jeton à signature altérée refusé');

    const expired = createSessionToken(Date.now() - 8 * 24 * 60 * 60 * 1000);
    assert.equal((await get('/api/profile', `${SESSION_COOKIE}=${expired}`)).status, 401);
    console.log('  ✓ Jeton expiré refusé');

    // 3. Mauvais puis bon mot de passe
    resetAllRateLimits();
    assert.equal((await login('mauvais')).status, 401, 'Mauvais mot de passe : 401');
    console.log('  ✓ Mauvais mot de passe : 401');

    const ok = await login('mot-de-passe-de-test-long');
    assert.equal(ok.status, 302, 'Bon mot de passe : redirection');
    const setCookie = ok.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('HttpOnly'), 'Cookie HttpOnly');
    assert.ok(setCookie.includes('Secure'), 'Cookie Secure en production');
    assert.ok(/SameSite=Strict/i.test(setCookie), 'Cookie SameSite=Strict');
    const cookie = setCookie.split(';')[0];
    assert.equal((await get('/api/profile', cookie)).status, 200, 'Avec session valide : 200');
    assert.equal((await get('/', cookie)).status, 200, 'Avec session valide : la page est servie');
    console.log('  ✓ Bon mot de passe : session valide, API et page accessibles');

    // 4. Limitation des tentatives : la 6e tentative est bloquée, même avec le bon mot de passe
    resetAllRateLimits();
    for (let i = 0; i < 5; i++) {
      assert.equal((await login('mauvais')).status, 401);
    }
    assert.equal((await login('mot-de-passe-de-test-long')).status, 429, 'Après 5 échecs : 429');
    console.log('  ✓ Après 5 échecs : 429');
    resetAllRateLimits();
    assert.equal((await login('mot-de-passe-de-test-long')).status, 302);

    console.log('\n========================================================================');
    console.log('SUCCÈS : LA PROTECTION PAR MOT DE PASSE EST VALIDÉE');
    console.log('========================================================================');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
