import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GMAIL_DEFAULT_SCOPES,
  GMAIL_SCOPES_STRING,
  getGmailOAuthConfig,
  buildGmailAuthUrl,
  consumeOAuthState,
  exchangeCodeForGmailTokens,
  readStoredGmailTokens,
  isAllowedActivationUrl,
  extractVerifiedActivationLinks,
  buildActivationSearchQuery,
  findActivationEmailLink,
  describeGmailScopesFr
} from '../server/services/gmailService.ts';

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-gmail-test-'));
  const tokenPath = path.join(tmpDir, 'token.json');

  try {
    // 1. Default port 3000 redirect URI and full Gmail scopes check
    const defaultCfg = getGmailOAuthConfig();
    assert.equal(defaultCfg.redirectUri, 'http://localhost:3000/api/auth/gmail/callback');
    assert.ok(defaultCfg.scopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
    assert.ok(defaultCfg.scopes.includes('https://www.googleapis.com/auth/gmail.compose'));
    assert.ok(defaultCfg.scopes.includes('https://www.googleapis.com/auth/gmail.send'));
    assert.ok(defaultCfg.scopes.includes('https://www.googleapis.com/auth/gmail.modify'));
    assert.ok(defaultCfg.scopes.includes('https://mail.google.com/'));

    const testCfg = {
      clientId: 'test-client-id.apps.googleusercontent.com',
      clientSecret: 'test-client-secret-placeholder',
      redirectUri: 'http://localhost:3000/api/auth/gmail/callback',
      tokenPath,
      scopes: GMAIL_DEFAULT_SCOPES
    };

    // 2. OAuth URL generation & single-use CSRF state
    const { url, state, scopes } = buildGmailAuthUrl({
      loginHint: 'jean.desfontaines@gmail.com',
      config: testCfg
    });
    const parsedAuth = new URL(url);
    assert.equal(parsedAuth.origin, 'https://accounts.google.com');
    assert.equal(parsedAuth.searchParams.get('scope'), GMAIL_SCOPES_STRING);
    assert.deepEqual(scopes, GMAIL_DEFAULT_SCOPES);
    assert.equal(parsedAuth.searchParams.get('redirect_uri'), 'http://localhost:3000/api/auth/gmail/callback');
    assert.equal(parsedAuth.searchParams.get('login_hint'), 'jean.desfontaines@gmail.com');
    assert.equal(parsedAuth.searchParams.get('state'), state);

    assert.equal(consumeOAuthState(state), true, 'Valid state must be accepted once');
    assert.equal(consumeOAuthState(state), false, 'Replayed state must be rejected');
    assert.equal(consumeOAuthState('invalid-state'), false, 'Unknown state must be rejected');

    // 3. Token exchange and storage (mocked fetch)
    const mockFetch: any = async (reqUrl: string, init?: any) => {
      if (reqUrl.includes('oauth2.googleapis.com/token')) {
        assert.equal(init?.method, 'POST');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            scope: GMAIL_SCOPES_STRING,
            token_type: 'Bearer',
            expires_in: 3600
          })
        };
      }
      if (reqUrl.endsWith('/profile')) {
        assert.equal(init?.method, 'GET');
        return {
          ok: true,
          status: 200,
          json: async () => ({ emailAddress: 'jean.desfontaines@gmail.com' })
        };
      }
      if (reqUrl.includes('/messages?')) {
        assert.equal(init?.method, 'GET');
        const u = new URL(reqUrl);
        assert.equal(u.searchParams.get('q'), 'from:lasource.ch to:jean.desfontaines@gmail.com newer_than:2d');
        return {
          ok: true,
          status: 200,
          json: async () => ({ messages: [{ id: 'msg-123' }] })
        };
      }
      if (reqUrl.includes('/messages/msg-123')) {
        assert.equal(init?.method, 'GET');
        const htmlBody = `
          Bonjour Jean,
          Cliquez sur ce lien pour activer votre compte :
          <a href="https://emploi.lasource.ch/?page=new_account&amp;action=validate&amp;id=999&amp;key=abcdef">Valider</a>
          Lien externe ignoré : https://phishing.example.com/?url=https://emploi.lasource.ch/
        `;
        const b64 = Buffer.from(htmlBody, 'utf-8').toString('base64url');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'msg-123',
            internalDate: String(Date.now()),
            payload: {
              headers: [
                { name: 'From', value: 'Recrutement <no-reply@lasource.ch>' },
                { name: 'Subject', value: 'Validation de votre compte Clinique de La Source' }
              ],
              body: { data: b64 }
            }
          })
        };
      }
      throw new Error(`Unexpected URL: ${reqUrl}`);
    };

    const exchanged = await exchangeCodeForGmailTokens('mock-auth-code', testCfg, mockFetch);
    assert.equal(exchanged.email, 'jean.desfontaines@gmail.com');
    assert.deepEqual(exchanged.grantedScopes, GMAIL_DEFAULT_SCOPES);
    const descriptions = describeGmailScopesFr(exchanged.grantedScopes);
    assert.equal(descriptions.length, GMAIL_DEFAULT_SCOPES.length);

    const stored = readStoredGmailTokens(testCfg);
    assert.ok(stored);
    assert.equal(stored.email, 'jean.desfontaines@gmail.com');

    // 4. Destination URL verification
    assert.equal(
      isAllowedActivationUrl('https://emploi.lasource.ch/?page=new_account&action=validate&key=123', 'emploi.lasource.ch'),
      true
    );
    assert.equal(
      isAllowedActivationUrl('http://emploi.lasource.ch/?page=new_account', 'emploi.lasource.ch'),
      false,
      'HTTP must be rejected'
    );
    assert.equal(
      isAllowedActivationUrl('https://attacker.com/?redirect=https://emploi.lasource.ch', 'emploi.lasource.ch'),
      false,
      'Mismatched host must be rejected'
    );

    const extracted = extractVerifiedActivationLinks(
      'Visitez https://www.lasource.ch/ ou validez sur https://emploi.lasource.ch/?page=new_account&amp;action=validate&amp;k=1',
      'emploi.lasource.ch'
    );
    assert.deepEqual(extracted, ['https://emploi.lasource.ch/?page=new_account&action=validate&k=1']);

    // 5. Restricted query & full activation email lookup
    const q = buildActivationSearchQuery({
      expectedDomain: 'emploi.lasource.ch',
      recipientEmail: 'jean.desfontaines@gmail.com'
    });
    assert.equal(q, 'from:lasource.ch to:jean.desfontaines@gmail.com newer_than:2d');

    const found = await findActivationEmailLink(
      {
        expectedDomain: 'emploi.lasource.ch',
        recipientEmail: 'jean.desfontaines@gmail.com'
      },
      testCfg,
      mockFetch
    );
    assert.equal(found.found, true);
    assert.equal(found.activationUrl, 'https://emploi.lasource.ch/?page=new_account&action=validate&id=999&key=abcdef');

    console.log('✅ test_gmail_oauth passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ test_gmail_oauth failed:', err);
  process.exit(1);
});
