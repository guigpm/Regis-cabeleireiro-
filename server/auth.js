import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { check } from './validation.js';
export function passwordHash(password) {
  check(typeof password === 'string' && password.length >= 12 && password.length <= 200, 'A senha deve ter entre 12 e 200 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function setPassword(db, password) {
  db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(passwordHash(password));
}
export function createAuth(db, {
  password,
  secure = false,
  onInitialPassword = () => {}
} = {}) {
  if (!db.prepare("SELECT 1 FROM settings WHERE key='admin_password'").get()) {
    const initial = password || randomBytes(18).toString('base64url');
    setPassword(db, initial);
    if (!password) onInitialPassword(initial);
  }
  const sessions = new Map();
  const cookie = (token, maxAge) => `rr_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  function token(req) {
    return /(?:^|;\s*)rr_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  }
  return {
    login(password, res) {
      check(typeof password === 'string' && password.length <= 200, 'Senha incorreta.', 401);
      const [salt, hash] = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value.split(':');
      check(timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex')), 'Senha incorreta.', 401);
      for (const [key, expires] of sessions) if (expires < Date.now()) sessions.delete(key);
      const key = randomBytes(32).toString('hex');
      sessions.set(key, Date.now() + 8 * 60 * 60 * 1000);
      res.setHeader('Set-Cookie', cookie(key, 8 * 60 * 60));
    },
    require(req) {
      check((sessions.get(token(req)) || 0) > Date.now(), 'Entre no painel para continuar.', 401);
    },
    logout(req, res) {
      sessions.delete(token(req));
      res.setHeader('Set-Cookie', cookie('', 0));
    }
  };
}
