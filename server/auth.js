import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { check } from './validation.js';
import { sessions } from './sessions.js';
import { newSecret, verifyTotp, recoveryCodes, recoveryHash } from './otp.js';
export function passwordHash(password) {
  check(
    typeof password === 'string' && password.length >= 12 && password.length <= 200,
    'A senha deve ter entre 12 e 200 caracteres.'
  );
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v2:${salt}:${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
}
const dummyHash = passwordHash(randomBytes(24).toString('hex'));
export function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const value = encoded || dummyHash;
  const modern = value.startsWith('scrypt-v2:');
  const payload = modern ? value.slice(10) : value;
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(payload)) return false;
  const [salt, hash] = payload.split(':');
  const options = modern ? { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } : undefined;
  const matches = timingSafeEqual(
    scryptSync(password, salt, 64, options),
    Buffer.from(hash, 'hex')
  );
  return Boolean(encoded && matches);
}
export function setPassword(db, password) {
  const hash = passwordHash(password);
  db.prepare(
    "INSERT INTO settings(key,value) VALUES('admin_password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(hash);
  db.prepare(
    "UPDATE administrators SET password_hash=?, auth_version=auth_version+1 WHERE username='root'"
  ).run(hash);
}
export function adminView(admin) {
  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role,
    barberId: admin.barber_id,
    otpEnabled: Boolean(admin.otp_secret)
  };
}
export function createAuth(db, { password, secure = false, onInitialPassword = () => {} } = {}) {
  if (password !== undefined && password !== '') setPassword(db, password);
  else if (!db.prepare("SELECT 1 FROM settings WHERE key='admin_password'").get()) {
    const initial = randomBytes(18).toString('base64url');
    setPassword(db, initial);
    onInitialPassword(initial);
  }
  db.prepare(
    "INSERT OR IGNORE INTO administrators(username,name,password_hash,role) VALUES('root','Administrador ROOT',?,'ROOT')"
  ).run(db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value);
  const store = sessions('rr_session', secure),
    challenges = new Map(),
    enrollments = new Map();
  function prune(map) {
    for (const [key, item] of map) if (item.expires < Date.now()) map.delete(key);
  }
  function current(id) {
    const admin = db.prepare('SELECT * FROM administrators WHERE id=? AND active=1').get(id);
    check(
      admin &&
        (admin.role === 'ROOT' ||
          db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(admin.barber_id)),
      'Conta indisponível.',
      401
    );
    return admin;
  }
  function consumeOtp(admin, code) {
    const counter = verifyTotp(admin.otp_secret, code, admin.otp_last_counter);
    if (counter !== null) {
      return Boolean(
        db
          .prepare('UPDATE administrators SET otp_last_counter=? WHERE id=? AND otp_last_counter<?')
          .run(counter, admin.id, counter).changes
      );
    }
    const hashes = JSON.parse(admin.recovery_hashes),
      index = hashes.indexOf(recoveryHash(String(code)));
    if (index < 0) return false;
    hashes.splice(index, 1);
    return Boolean(
      db
        .prepare('UPDATE administrators SET recovery_hashes=? WHERE id=? AND recovery_hashes=?')
        .run(JSON.stringify(hashes), admin.id, admin.recovery_hashes).changes
    );
  }
  const api = {
    login(input, res, req) {
      const data =
        typeof input === 'string'
          ? {
              password: input,
              username: 'root'
            }
          : input;
      const username =
        typeof data.username === 'string' ? data.username.trim().toLowerCase() : 'root';
      const admin = db
        .prepare('SELECT * FROM administrators WHERE username=? AND active=1')
        .get(username);
      check(
        passwordMatches(data.password, admin?.password_hash),
        'Usuário ou senha incorretos.',
        401
      );
      current(admin.id);
      // Upgrade legacy hashes only after a successful password check; OTP is still required.
      if (!admin.password_hash.startsWith('scrypt-v2:'))
        db.prepare('UPDATE administrators SET password_hash=? WHERE id=?').run(
          passwordHash(data.password),
          admin.id
        );
      if (admin.otp_secret) {
        prune(challenges);
        const challenge = randomBytes(32).toString('hex');
        challenges.set(challenge, {
          id: admin.id,
          version: admin.auth_version,
          expires: Date.now() + 5 * 60000,
          attempts: 0
        });
        return {
          otpRequired: true,
          challenge
        };
      }
      store.create(
        res,
        {
          id: admin.id,
          version: admin.auth_version
        },
        req
      );
      return {
        admin: adminView(admin)
      };
    },
    verify(data, res, req) {
      prune(challenges);
      const challenge = challenges.get(data.challenge);
      check(challenge, 'Login expirado. Informe usuário e senha novamente.', 401);
      challenge.attempts++;
      if (challenge.attempts >= 5) challenges.delete(data.challenge);
      const admin = current(challenge.id);
      check(
        admin.auth_version === challenge.version &&
          admin.otp_secret &&
          consumeOtp(admin, data.code),
        'Código inválido ou já utilizado.',
        401
      );
      challenges.delete(data.challenge);
      store.create(
        res,
        {
          id: admin.id,
          version: admin.auth_version
        },
        req
      );
      return {
        admin: adminView(admin)
      };
    },
    require(req) {
      const session = store.require(req),
        admin = current(session.id);
      check(admin.auth_version === session.version, 'Sessão expirada. Entre novamente.', 401);
      return admin;
    },
    logout(req, res) {
      store.destroy(req, res);
    },
    setup(admin, password) {
      check(passwordMatches(password, admin.password_hash), 'Senha incorreta.', 401);
      check(!admin.otp_secret, 'OTP já está ativo.');
      prune(enrollments);
      const secret = newSecret();
      enrollments.set(admin.id, {
        secret,
        version: admin.auth_version,
        expires: Date.now() + 10 * 60000
      });
      return {
        secret,
        uri: `otpauth://totp/${encodeURIComponent('R&R:' + admin.username)}?secret=${secret}&issuer=R%26R&algorithm=SHA1&digits=6&period=30`
      };
    },
    enable(admin, code, req, res) {
      prune(enrollments);
      const pending = enrollments.get(admin.id);
      check(
        pending && pending.version === admin.auth_version && !admin.otp_secret,
        'Inicie a configuração novamente.'
      );
      const counter = verifyTotp(pending.secret, code);
      check(counter !== null, 'Código inválido.');
      const codes = recoveryCodes();
      db.prepare(
        'UPDATE administrators SET otp_secret=?,otp_last_counter=?,recovery_hashes=?,auth_version=auth_version+1 WHERE id=?'
      ).run(pending.secret, counter, JSON.stringify(codes.map(recoveryHash)), admin.id);
      enrollments.delete(admin.id);
      store.invalidate((s) => s.id === admin.id);
      const updated = current(admin.id);
      store.create(
        res,
        {
          id: updated.id,
          version: updated.auth_version
        },
        req
      );
      return {
        recoveryCodes: codes,
        admin: adminView(updated)
      };
    },
    disable(admin, data, req, res) {
      check(
        passwordMatches(data.password, admin.password_hash) &&
          admin.otp_secret &&
          consumeOtp(admin, data.code),
        'Senha ou código inválido.',
        401
      );
      db.prepare(
        "UPDATE administrators SET otp_secret=NULL,otp_last_counter=-1,recovery_hashes='[]',auth_version=auth_version+1 WHERE id=?"
      ).run(admin.id);
      store.invalidate((s) => s.id === admin.id);
      const updated = current(admin.id);
      store.create(
        res,
        {
          id: updated.id,
          version: updated.auth_version
        },
        req
      );
      return {
        admin: adminView(updated)
      };
    }
  };
  return api;
}
