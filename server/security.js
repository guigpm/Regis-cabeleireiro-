import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { check } from './validation.js';

/** A signed double-submit token protects even mutations with no JSON body (e.g. DELETE). */
export function csrfProtection(secure) {
  const secret = randomBytes(32);
  const cookie = (req) =>
    (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('rr_csrf='))
      ?.slice(8);
  const sign = (nonce) => createHmac('sha256', secret).update(nonce).digest('hex');
  return {
    issue(req, res) {
      const existing = cookie(req);
      if (
        existing &&
        /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(existing) &&
        timingSafeEqual(
          Buffer.from(existing.split('.')[1], 'hex'),
          Buffer.from(sign(existing.split('.')[0]), 'hex')
        )
      )
        return { token: existing };
      const nonce = randomBytes(32).toString('hex'),
        token = nonce + '.' + sign(nonce);
      res.setHeader(
        'Set-Cookie',
        `rr_csrf=${token}; HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`
      );
      return { token };
    },
    verify(req) {
      const token = req.headers['x-csrf-token'];
      check(
        typeof token === 'string' &&
          /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token) &&
          cookie(req) === token,
        'Token de segurança ausente ou expirado. Atualize a página.',
        403
      );
      const [nonce, signature] = token.split('.');
      check(
        timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(nonce), 'hex')),
        'Token de segurança inválido.',
        403
      );
    }
  };
}
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "worker-src 'self'",
  'frame-src https://www.google.com https://maps.google.com',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
