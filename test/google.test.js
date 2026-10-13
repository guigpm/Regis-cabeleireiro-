import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.js';
import { createCustomers } from '../server/customers.js';
import { googleLogin } from '../server/google.js';
function response() {
  return {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    getHeader(key) {
      return this.headers[key];
    },
    writeHead(status, headers) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    end() {}
  };
}
test('Google: state vinculado ao navegador, PKCE, cadastro incompleto e proteção contra vínculo por e-mail', async () => {
  const db = openDatabase(':memory:'),
    customers = createCustomers(db);
  const requests = [];
  const google = googleLogin(customers, {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: 'http://localhost/api/customer/google/callback',
    fetch: async (url, options) => {
      requests.push({
        url,
        options
      });
      return {
        ok: true,
        json: async () => url.includes('/token') ? {
          access_token: 'test-access'
        } : {
          sub: 'google-user-123',
          email: 'google@example.test',
          email_verified: true,
          name: 'Google Test'
        }
      };
    }
  });
  try {
    const start = response();
    google.start({
      headers: {}
    }, start);
    const url = new URL(start.headers.Location),
      state = url.searchParams.get('state');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    const params = new URLSearchParams({
      state,
      code: 'test-code'
    });
    await assert.rejects(() => google.callback({
      headers: {}
    }, response(), params), {
      status: 401
    });
    assert.equal(requests.length, 0);
    const end = response();
    await google.callback({
      headers: {
        cookie: `rr_google_state=${state}`
      }
    }, end, params);
    assert.equal(end.status, 302);
    assert.ok(requests[0].options.body.get('code_verifier'));
    const clientCookie = end.headers['Set-Cookie'][0].split(';')[0],
      req = {
        headers: {
          cookie: clientCookie
        }
      };
    assert.equal(customers.current(req).google_sub, 'google-user-123');
    assert.throws(() => customers.current(req, true), {
      status: 403
    });
    await assert.rejects(() => google.callback({
      headers: {
        cookie: `rr_google_state=${state}`
      }
    }, response(), params), {
      status: 401
    });
    const completed = customers.complete(req, {
      name: 'Google Test',
      cpf: '52998224725',
      phone: '41999990000'
    });
    assert.equal(completed.customer.complete, true);
    assert.ok(customers.current(req, true));
    assert.throws(() => customers.google({
      sub: 'another-sub',
      email: 'google@example.test',
      email_verified: true,
      name: 'Other'
    }, response(), {
      headers: {}
    }), {
      status: 409
    });
    assert.throws(() => customers.google({
      sub: 'unverified',
      email: 'other@example.test',
      email_verified: false,
      name: 'Other'
    }, response(), {
      headers: {}
    }), {
      status: 401
    });
  } finally {
    db.close();
  }
});
