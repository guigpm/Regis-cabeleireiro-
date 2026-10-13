import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.js';
import { createAuth } from '../server/auth.js';
const response = {
  setHeader() {}
};
test('senha do ambiente atualiza um banco existente ao reiniciar', () => {
  const db = openDatabase(':memory:');
  try {
    createAuth(db, {
      password: 'senha-inicial-123'
    });
    const auth = createAuth(db, {
      password: 'senha-atualizada-456'
    });
    assert.doesNotThrow(() => auth.login('senha-atualizada-456', response));
    assert.throws(() => auth.login('senha-inicial-123', response), {
      status: 401
    });
    const stored = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value;
    assert.notEqual(stored, 'senha-atualizada-456');
    for (const password of [undefined, '']) {
      const unchanged = createAuth(db, {
        password,
        onInitialPassword() {
          assert.fail('Não deve gerar outra senha');
        }
      });
      assert.doesNotThrow(() => unchanged.login('senha-atualizada-456', response));
    }
    assert.throws(() => createAuth(db, {
      password: 'curta'
    }), /12 e 200/);
    assert.equal(db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value, stored);
  } finally {
    db.close();
  }
});
test('sem senha configurada, gera senha apenas no primeiro início', () => {
  const db = openDatabase(':memory:');
  try {
    let generated;
    const auth = createAuth(db, {
      password: '',
      onInitialPassword(value) {
        generated = value;
      }
    });
    assert.ok(generated.length >= 12);
    assert.doesNotThrow(() => auth.login(generated, response));
    createAuth(db, {
      onInitialPassword() {
        assert.fail('Senha existente deve ser mantida');
      }
    });
  } finally {
    db.close();
  }
});
test('trocar senha do ROOT não desativa a segunda etapa', () => {
  const db = openDatabase(':memory:');
  try {
    createAuth(db, {
      password: 'senha-inicial-123'
    });
    db.prepare("UPDATE administrators SET otp_secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' WHERE username='root'").run();
    const auth = createAuth(db, {
      password: 'senha-atualizada-456'
    });
    const result = auth.login('senha-atualizada-456', {
      setHeader() {
        assert.fail('Sem sessão antes do OTP');
      }
    });
    assert.equal(result.otpRequired, true);
  } finally {
    db.close();
  }
});
