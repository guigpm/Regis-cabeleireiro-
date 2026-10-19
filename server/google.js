import { randomBytes, createHash } from 'node:crypto';
import { check } from './validation.js';

// Authorization Code + PKCE; só o servidor troca o código e consulta o perfil Google.
export function googleLogin(customers, options = {}) {
  const clientId = options.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = options.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = options.redirectUri || process.env.GOOGLE_REDIRECT_URI;
  const enabled = Boolean(clientId && clientSecret && redirectUri);
  const pending = new Map(),
    secure = options.secure;
  const request = options.fetch || fetch;
  const cookie = (state, age) =>
    `rr_google_state=${state}; HttpOnly; SameSite=Lax; Path=/api/customer/google; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function prune() {
    for (const [key, entry] of pending) if (entry.expires < Date.now()) pending.delete(key);
  }
  return {
    enabled,
    start(req, res) {
      check(enabled, 'Login Google ainda não configurado.', 503);
      prune();
      const state = randomBytes(32).toString('hex'),
        verifier = randomBytes(32).toString('base64url');
      pending.set(state, {
        verifier,
        expires: Date.now() + 5 * 60000
      });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        prompt: 'select_account'
      });
      res.setHeader('Set-Cookie', cookie(state, 300));
      res.writeHead(302, {
        Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + params
      });
      res.end();
    },
    async callback(req, res, query) {
      check(enabled, 'Login Google não configurado.', 503);
      prune();
      const state = query.get('state');
      const browserState = /(?:^|;\s*)rr_google_state=([a-f0-9]{64})(?:;|$)/.exec(
        req.headers.cookie || ''
      )?.[1];
      const entry = pending.get(state);
      check(
        state && state === browserState && entry,
        'Login Google expirado. Tente novamente.',
        401
      );
      pending.delete(state);
      check(!query.has('error') && query.get('code'), 'Login Google cancelado.', 400);
      const tokenResponse = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        body: new URLSearchParams({
          code: query.get('code'),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: entry.verifier
        })
      });
      check(tokenResponse.ok, 'Não foi possível confirmar o login Google.', 401);
      const token = await tokenResponse.json();
      check(typeof token.access_token === 'string', 'Resposta Google inválida.', 401);
      const profileResponse = await request('https://openidconnect.googleapis.com/v1/userinfo', {
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: 'Bearer ' + token.access_token
        }
      });
      check(profileResponse.ok, 'Não foi possível consultar a conta Google.', 401);
      customers.google(await profileResponse.json(), res, req);
      const sessionCookie = res.getHeader('Set-Cookie');
      res.setHeader('Set-Cookie', [sessionCookie, cookie('', 0)]);
      res.writeHead(302, {
        Location: '/?account=google#conta'
      });
      res.end();
    }
  };
}
