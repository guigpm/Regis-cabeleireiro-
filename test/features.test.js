import { secureFetch as fetch } from './helpers/http.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/database.js';
import { migrate } from '../server/migrations.js';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { cpf } from '../server/identity.js';
import { totp, verifyTotp } from '../server/otp.js';
import { localDate } from '../server/booking.js';
import { nowOptions, requestNow, decideNow, expireWalkins } from '../server/walkins.js';
import { serviceSelection } from '../server/permissions.js';
const password = 'test-password-12345';
const registration = {
  name: 'Cliente Teste',
  email: 'cliente@example.test',
  cpf: '529.982.247-25',
  phone: '41999990000',
  password
};
test('CPF: normalização, dígitos inválidos e sequências repetidas', () => {
  assert.equal(cpf(registration.cpf), '52998224725');
  for (const value of ['11111111111', '00000000000', '52998224724', '123', '52998224725x'])
    assert.throws(() => cpf(value));
});
test('TOTP segue o vetor RFC 6238 e rejeita reutilização', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret, 1, 8), '94287082');
  assert.equal(verifyTotp(secret, '287082', -1, 59000), 1);
  assert.equal(verifyTotp(secret, '287082', 1, 59000), null);
});
test('migração preserva registros legados e pode ser repetida', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(
      "CREATE TABLE barbers(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE services(id INTEGER PRIMARY KEY); CREATE TABLE blocks(id INTEGER PRIMARY KEY); CREATE TABLE products(id INTEGER PRIMARY KEY); CREATE TABLE appointments(id TEXT PRIMARY KEY,date TEXT); INSERT INTO barbers VALUES(1,'Existente'); INSERT INTO appointments VALUES('antigo','2026-10-14');"
    );
    migrate(db);
    migrate(db);
    assert.equal(db.prepare('SELECT name,all_services FROM barbers').get().all_services, 1);
    assert.equal(db.prepare('SELECT id,customer_id FROM appointments').get().id, 'antigo');
    assert.equal(db.prepare('SELECT count(*) total FROM schema_migrations').get().total, 2);
  } finally {
    db.close();
  }
});
test('clientes, permissões e OTP através da API', async (t) => {
  const db = openDatabase(':memory:'),
    server = createApp(db, {
      password
    });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function req(path, method = 'GET', data, cookie = '') {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0]
    };
  }
  const day = new Date(Date.now() + 3 * 86400000);
  while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const date = localDate(day),
    query = `/api/availability?date=${date}&barberId=1&serviceId=1`;
  let client, root, barber1, barber2;
  try {
    await t.test('cadastro obrigatório, CPF único e sessão do cliente', async () => {
      assert.equal((await req(query)).status, 401);
      assert.equal((await req('/api/appointments', 'POST', {})).status, 401);
      assert.equal(
        (
          await req('/api/customer/register', 'POST', {
            ...registration,
            cpf: '11111111111'
          })
        ).status,
        400
      );
      const result = await req('/api/customer/register', 'POST', registration);
      assert.equal(result.status, 201);
      client = result.cookie;
      assert.equal(result.data.customer.complete, true);
      assert.ok(!JSON.stringify(result.data).includes('52998224725'));
      assert.equal(
        (
          await req('/api/customer/register', 'POST', {
            ...registration,
            email: 'outro@example.test'
          })
        ).status,
        409
      );
      assert.equal(
        (
          await req('/api/customer/login', 'POST', {
            identifier: registration.cpf,
            password
          })
        ).status,
        200
      );
      assert.equal((await req(query, 'GET', undefined, client)).status, 200);
      assert.equal(
        (
          await req(
            '/api/customer/profile',
            'PUT',
            {
              name: registration.name,
              cpf: '11111111111',
              phone: registration.phone
            },
            client
          )
        ).status,
        400
      );
    });
    await t.test('ROOT separado dos profissionais e contas com escopo próprio', async () => {
      root = (
        await req('/api/admin/login', 'POST', {
          username: 'root',
          password
        })
      ).cookie;
      for (const id of [1, 2])
        assert.equal(
          (
            await req(
              '/api/admin/accounts',
              'POST',
              {
                username: 'barber' + id,
                name: 'Profissional ' + id,
                role: 'BARBER',
                barberId: id,
                password
              },
              root
            )
          ).status,
          200
        );
      barber1 = (
        await req('/api/admin/login', 'POST', {
          username: 'barber1',
          password
        })
      ).cookie;
      barber2 = (
        await req('/api/admin/login', 'POST', {
          username: 'barber2',
          password
        })
      ).cookie;
      assert.equal(
        (
          await req(
            '/api/admin/services',
            'POST',
            {
              name: 'Invasão',
              price: 10,
              duration: 30
            },
            barber1
          )
        ).status,
        403
      );
      assert.equal((await req('/api/admin/products', 'POST', {}, barber1)).status, 403);
      assert.equal((await req('/api/admin/accounts', 'GET', undefined, barber1)).status, 403);
      assert.equal((await req('/api/admin/hours', 'PUT', {}, barber1)).status, 403);
      assert.equal(
        (
          await req(
            '/api/admin/barbers/2/services',
            'PUT',
            {
              allServices: true,
              serviceIds: []
            },
            barber1
          )
        ).status,
        403
      );
      const catalog = (await req('/api/catalog')).data;
      assert.equal(catalog.barbers.length, 2);
      assert.ok(!catalog.barbers.some((b) => b.name.includes('ROOT')));
      assert.equal(
        (
          await req(
            '/api/admin/barbers/1/services',
            'PUT',
            {
              allServices: false,
              serviceIds: [2]
            },
            barber1
          )
        ).status,
        200
      );
      assert.equal((await req(query, 'GET', undefined, client)).status, 400);
      assert.equal(
        (
          await req(
            '/api/admin/barbers/1/services',
            'PUT',
            {
              allServices: true,
              serviceIds: []
            },
            barber1
          )
        ).status,
        200
      );
      const newService = await req(
        '/api/admin/services',
        'POST',
        {
          name: 'Serviço novo',
          price: 25,
          duration: 30
        },
        root
      );
      assert.equal(
        (
          await req(
            `/api/availability?date=${date}&barberId=1&serviceId=${newService.data.id}`,
            'GET',
            undefined,
            client
          )
        ).status,
        200
      );
    });
    let appointmentId;
    await t.test(
      'ocupação visual sem dados pessoais e isolamento entre cabeleireiros',
      async () => {
        const created = await req(
          '/api/appointments',
          'POST',
          {
            date,
            time: '09:00',
            serviceId: 1,
            barberId: 1,
            payment: 'Pix',
            customer: 'Nome falsificado'
          },
          client
        );
        assert.equal(created.status, 201);
        appointmentId = created.data.id;
        assert.equal(created.data.customer, registration.name);
        const result = (await req(query, 'GET', undefined, client)).data;
        assert.equal(result.timeline.find((s) => s.time === '09:00').state, 'occupied');
        assert.ok(!JSON.stringify(result).includes(registration.name));
        assert.equal(
          (await req('/api/admin/appointments/' + appointmentId, 'DELETE', undefined, barber2))
            .status,
          403
        );
        assert.equal(
          (await req('/api/admin/appointments?date=' + date, 'GET', undefined, barber2)).data
            .length,
          0
        );
        assert.equal(
          (await req('/api/admin/appointments?date=' + date, 'GET', undefined, barber1)).data
            .length,
          1
        );
        assert.equal(
          (
            await req(
              '/api/admin/blocks',
              'POST',
              {
                barberId: 2,
                date,
                start: '12:00',
                end: '13:00',
                reason: 'Teste'
              },
              barber1
            )
          ).status,
          403
        );
      }
    );
    await t.test(
      'OTP só ativa após código válido, exige segunda etapa e recovery é uso único',
      async () => {
        const setup = await req(
          '/api/admin/otp/setup',
          'POST',
          {
            password
          },
          root
        );
        assert.equal(setup.status, 200);
        assert.equal(
          (
            await req(
              '/api/admin/otp/enable',
              'POST',
              {
                code: 'invalid'
              },
              root
            )
          ).status,
          400
        );
        const enabled = await req(
          '/api/admin/otp/enable',
          'POST',
          {
            code: totp(setup.data.secret, Math.floor(Date.now() / 30000))
          },
          root
        );
        assert.equal(enabled.status, 200);
        root = enabled.cookie;
        const login = await req('/api/admin/login', 'POST', {
          username: 'root',
          password
        });
        assert.equal(login.data.otpRequired, true);
        assert.equal(login.cookie, undefined);
        assert.equal((await req('/api/admin/session')).status, 401);
        assert.equal(
          (
            await req('/api/admin/login/otp', 'POST', {
              challenge: login.data.challenge,
              code: 'invalid'
            })
          ).status,
          401
        );
        const verified = await req('/api/admin/login/otp', 'POST', {
          challenge: login.data.challenge,
          code: enabled.data.recoveryCodes[0]
        });
        assert.equal(verified.status, 200);
        assert.equal(
          (
            await req('/api/admin/login/otp', 'POST', {
              challenge: login.data.challenge,
              code: enabled.data.recoveryCodes[1]
            })
          ).status,
          401
        );
        const again = await req('/api/admin/login', 'POST', {
          username: 'root',
          password
        });
        assert.equal(
          (
            await req('/api/admin/login/otp', 'POST', {
              challenge: again.data.challenge,
              code: enabled.data.recoveryCodes[0]
            })
          ).status,
          401
        );
        assert.equal(
          (
            await req(
              '/api/admin/otp/disable',
              'POST',
              {
                password,
                code: enabled.data.recoveryCodes[1]
              },
              verified.cookie
            )
          ).status,
          200
        );
        assert.ok(
          (
            await req('/api/admin/login', 'POST', {
              username: 'root',
              password
            })
          ).cookie
        );
      }
    );
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    db.close();
  }
});
test('presencial: reserva temporária, profissional correto, confirmação, recusa e expiração', () => {
  const db = openDatabase(':memory:');
  try {
    createAuth(db, {
      password
    });
    db.prepare(
      "INSERT INTO customers(name,email,cpf,phone) VALUES('Teste','t@example.test','52998224725','41999990000')"
    ).run();
    const customer = db.prepare('SELECT * FROM customers').get();
    db.prepare(
      "INSERT INTO administrators(username,name,password_hash,role,barber_id) SELECT 'barber','Barber',password_hash,'BARBER',1 FROM administrators WHERE username='root'"
    ).run();
    const barber = db.prepare("SELECT * FROM administrators WHERE username='barber'").get();
    const root = db.prepare("SELECT * FROM administrators WHERE username='root'").get();
    const now = new Date('2026-10-14T13:00:00Z');
    assert.ok(nowOptions(db, now).some((o) => o.barberId === 1 && o.serviceId === 1));
    const item = requestNow(
      db,
      {
        barberId: 1,
        serviceId: 1,
        payment: 'Pix'
      },
      customer,
      now
    );
    assert.throws(
      () =>
        requestNow(
          db,
          {
            barberId: 1,
            serviceId: 1,
            payment: 'Pix'
          },
          customer,
          now
        ),
      {
        status: 409
      }
    );
    assert.ok(!nowOptions(db, now).some((o) => o.barberId === 1 && o.serviceId === 1));
    assert.throws(
      () =>
        decideNow(
          db,
          {
            role: 'BARBER',
            barber_id: 2
          },
          item.id,
          'accept',
          now
        ),
      {
        status: 403
      }
    );
    assert.throws(() => decideNow(db, root, item.id, 'accept', now), {
      status: 403
    });
    const accepted = decideNow(db, barber, item.id, 'accept', new Date(now.getTime() + 60000));
    assert.equal(accepted.status, 'confirmed');
    assert.equal(db.prepare('SELECT customer_id FROM appointments').get().customer_id, customer.id);
    assert.throws(() => decideNow(db, barber, item.id, 'accept', now), {
      status: 409
    });
    const later = new Date('2026-10-14T16:00:00Z');
    const rejected = requestNow(
      db,
      {
        barberId: 1,
        serviceId: 1,
        payment: 'Pix'
      },
      customer,
      later
    );
    assert.equal(decideNow(db, barber, rejected.id, 'reject', later).status, 'rejected');
    const expires = requestNow(
      db,
      {
        barberId: 1,
        serviceId: 1,
        payment: 'Pix'
      },
      customer,
      later
    );
    expireWalkins(db, later.getTime() + 5 * 60000);
    assert.equal(
      db.prepare('SELECT status FROM walkins WHERE id=?').get(expires.id).status,
      'expired'
    );
    assert.ok(nowOptions(db, new Date(later.getTime() + 6 * 60000)).length > 0);
    serviceSelection(db, root, 1, {
      allServices: false,
      serviceIds: []
    });
    assert.equal(nowOptions(db, later).length, 0);
  } finally {
    db.close();
  }
});
