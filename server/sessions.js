import { randomBytes } from 'node:crypto';
import { check } from './validation.js';
export function sessions(name, secure = false, maxAge = 8 * 3600, sameSite = 'Strict') {
  const entries = new Map();
  const cookie = (value, age) => `${name}=${value}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const token = req => (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(name + '='))?.slice(name.length + 1);
  function prune() {
    for (const [key, item] of entries) if (item.expires <= Date.now()) entries.delete(key);
  }
  return {
    create(res, value, req) {
      prune();
      if (req) entries.delete(token(req));
      const key = randomBytes(32).toString('hex');
      entries.set(key, {
        value,
        expires: Date.now() + maxAge * 1000
      });
      res.setHeader('Set-Cookie', cookie(key, maxAge));
      return value;
    },
    read(req) {
      prune();
      return entries.get(token(req))?.value;
    },
    require(req) {
      const value = this.read(req);
      check(value, 'Entre na sua conta para continuar.', 401);
      return value;
    },
    destroy(req, res) {
      entries.delete(token(req));
      res.setHeader('Set-Cookie', cookie('', 0));
    },
    invalidate(predicate) {
      for (const [key, item] of entries) if (predicate(item.value)) entries.delete(key);
    }
  };
}
