import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { localDate, availability } from '../server/booking.js';
const password = 'test-password-strong-123';
function nextWeekday() {
  const day = new Date(Date.now() + 2 * 86400000);
  while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return localDate(day);
}
test('API, reservas concorrentes, autenticação e persistência', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'rr-test-'));
  const filename = join(directory, 'database.sqlite');
  let db = openDatabase(filename),
    server = createApp(db, {
      password
    });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let customerCookie = '';
  let cookie = '',
    appointmentId;
  const date = nextWeekday();
  async function request(path, {
    method = 'GET',
    data,
    admin = false,
    headers = {}
  } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(admin ? {
          Cookie: cookie
        } : {
          Cookie: customerCookie
        }),
        ...headers
      },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return {
      status: response.status,
      body,
      headers: response.headers
    };
  }
  const booking = {
    date,
    barberId: 1,
    serviceId: 1,
    time: '09:00',
    customer: 'Cliente Teste',
    phone: '41999998888',
    payment: 'Pix'
  };
  try {
    const registered = await request('/api/customer/register', {
      method: 'POST',
      data: {
        name: 'Cliente Teste',
        email: 'teste@example.test',
        cpf: '52998224725',
        phone: '41999998888',
        password: 'customer-password-123'
      }
    });
    assert.equal(registered.status, 201);
    customerCookie = registered.headers.get('set-cookie').split(';')[0];
    await t.test('cliente não contém painel e arquivos privados não são servidos', async () => {
      const home = await request('/');
      assert.equal(home.status, 200);
      assert.doesNotMatch(home.body, /painel|admin\.js|openProductAdmin|Gerenciar/i);
      for (const path of ['/server/seed.json', '/.env', '/data/barbearia.sqlite', '/assets/../server/app.js']) assert.equal((await request(path)).status, 404);
      const panel = await request('/painel');
      assert.equal(panel.status, 200);
      assert.match(panel.headers.get('x-robots-tag'), /noindex/);
      const publicCatalog = (await request('/api/catalog')).body;
      assert.equal(publicCatalog.services.length, 19);
      assert.equal(publicCatalog.barbers.length, 2);
      assert.doesNotMatch(JSON.stringify(publicCatalog), /admin_password|customer|phone/);
    });
    await t.test('rotas privadas exigem sessão e login valida senha', async () => {
      assert.equal((await request('/api/admin/appointments?date=' + date)).status, 401);
      assert.equal((await request('/api/admin/services', {
        method: 'POST',
        data: {}
      })).status, 401);
      assert.equal((await request('/api/admin/login', {
        method: 'POST',
        data: {
          password: 'wrong'
        }
      })).status, 401);
      const login = await request('/api/admin/login', {
        method: 'POST',
        data: {
          password
        }
      });
      assert.equal(login.status, 200);
      cookie = login.headers.get('set-cookie').split(';')[0];
      assert.match(login.headers.get('set-cookie'), /HttpOnly/);
      assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
      assert.equal((await request('/api/admin/session', {
        admin: true
      })).status, 200);
      assert.equal((await request('/api/admin/services', {
        method: 'POST',
        admin: true,
        data: {},
        headers: {
          Origin: 'https://evil.example'
        }
      })).status, 403);
    });
    await t.test('disponibilidade considera duração, fechamento e datas inválidas', async () => {
      const result = await request(`/api/availability?date=${date}&barberId=1&serviceId=1`);
      assert.equal(result.status, 200);
      assert.ok(result.body.slots.includes('09:00'));
      assert.ok(result.body.slots.includes('19:00'));
      assert.ok(!result.body.slots.includes('19:30'));
      assert.equal((await request('/api/availability?date=2026-02-30&barberId=1&serviceId=1')).status, 400);
      assert.equal((await request('/api/availability?date=2000-01-01&barberId=1&serviceId=1')).status, 400);
      const day = new Date(date + 'T12:00:00Z');
      while (day.getUTCDay() !== 0) day.setUTCDate(day.getUTCDate() + 1);
      assert.deepEqual(availability(db, {
        date: day.toISOString().slice(0, 10),
        barberId: 1,
        serviceId: 1
      }).slots, []);
      const fixed = new Date('2026-10-13T13:15:00Z');
      const slots = availability(db, {
        date: '2026-10-13',
        barberId: 1,
        serviceId: 1
      }, fixed).slots;
      assert.ok(!slots.includes('10:00'));
      assert.ok(slots.includes('10:30'));
    });
    await t.test('duas reservas simultâneas: uma aceita e outra recebe conflito', async () => {
      const responses = await Promise.all([request('/api/appointments', {
        method: 'POST',
        data: {
          ...booking,
          price: 0
        }
      }), request('/api/appointments', {
        method: 'POST',
        data: booking
      })]);
      assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
      const saved = responses.find(r => r.status === 201).body;
      appointmentId = saved.id;
      assert.equal(saved.price, 50);
      assert.equal((await request('/api/appointments', {
        method: 'POST',
        data: {
          ...booking,
          time: '09:30'
        }
      })).status, 409);
      assert.equal((await request('/api/appointments', {
        method: 'POST',
        data: {
          ...booking,
          barberId: 2
        }
      })).status, 201);
      assert.equal((await request('/api/appointments', {
        method: 'POST',
        data: {
          ...booking,
          time: '20:00'
        }
      })).status, 409);
      const list = (await request('/api/admin/appointments?date=' + date, {
        admin: true
      })).body;
      assert.equal(list.length, 2);
      assert.equal(list[0].customer, booking.customer);
    });
    await t.test('validação rejeita entradas inválidas', async () => {
      assert.equal((await request('/api/appointments', {
        method: 'POST',
        data: {
          ...booking,
          time: '12:00',
          payment: 'inválido'
        }
      })).status, 400);
      assert.equal((await request('/api/admin/products', {
        method: 'POST',
        admin: true,
        data: {
          name: 'Produto',
          price: 10,
          category: 'Barba',
          image: 'javascript:alert(1)'
        }
      })).status, 400);
    });
    await t.test('cancelamento libera horário; bloqueio impede novas reservas', async () => {
      assert.equal((await request('/api/admin/blocks', {
        method: 'POST',
        admin: true,
        data: {
          barberId: 1,
          date,
          start: '09:00',
          end: '10:00',
          reason: 'Almoço'
        }
      })).status, 409);
      assert.equal((await request('/api/admin/appointments/' + appointmentId, {
        method: 'DELETE',
        admin: true
      })).status, 200);
      assert.ok(availability(db, booking).slots.includes('09:00'));
      const block = await request('/api/admin/blocks', {
        method: 'POST',
        admin: true,
        data: {
          barberId: 1,
          date,
          start: '09:00',
          end: '10:00',
          reason: 'Intervalo'
        }
      });
      assert.equal(block.status, 201);
      assert.ok(!availability(db, booking).slots.includes('09:00'));
      assert.equal((await request('/api/appointments', {
        method: 'POST',
        data: booking
      })).status, 409);
      assert.equal((await request('/api/admin/blocks/' + block.body.id, {
        method: 'DELETE',
        admin: true
      })).status, 200);
      assert.ok(availability(db, booking).slots.includes('09:00'));
    });
    await t.test('CRUD no banco e alterações de expediente', async () => {
      for (const [kind, data] of Object.entries({
        services: {
          name: 'Novo serviço',
          price: 12,
          duration: 30
        },
        barbers: {
          name: 'Profissional novo',
          spec: 'Corte',
          photo: ''
        },
        products: {
          name: 'Produto novo',
          price: 25,
          category: 'Cabelo',
          image: ''
        }
      })) {
        const created = await request('/api/admin/' + kind, {
          method: 'POST',
          admin: true,
          data
        });
        assert.equal(created.status, 201);
        const id = created.body.id;
        assert.equal((await request(`/api/admin/${kind}/${id}`, {
          method: 'PUT',
          admin: true,
          data: {
            ...data,
            name: 'Nome atualizado'
          }
        })).status, 200);
        assert.ok((await request('/api/catalog')).body[kind].some(item => item.name === 'Nome atualizado'));
        assert.equal((await request(`/api/admin/${kind}/${id}`, {
          method: 'DELETE',
          admin: true
        })).status, 200);
        assert.ok(!(await request('/api/catalog')).body[kind].some(item => item.id === id));
      }
      const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
      const hours = Array.from({
        length: 7
      }, (_, weekday) => ({
        weekday,
        opens: '10:00',
        closes: '18:00',
        closed: false
      }));
      assert.equal((await request('/api/admin/hours', {
        method: 'PUT',
        admin: true,
        data: {
          hours
        }
      })).status, 200);
      assert.ok(!availability(db, booking).slots.includes('09:00'));
      hours[weekday].closed = true;
      assert.equal((await request('/api/admin/hours', {
        method: 'PUT',
        admin: true,
        data: {
          hours
        }
      })).status, 200);
      assert.deepEqual(availability(db, booking).slots, []);
      assert.equal(db.prepare('SELECT count(*) count FROM appointments').get().count, 2);
    });
    await t.test('logout invalida a sessão', async () => {
      assert.equal((await request('/api/admin/logout', {
        method: 'POST',
        admin: true,
        data: {}
      })).status, 200);
      assert.equal((await request('/api/admin/session', {
        admin: true
      })).status, 401);
    });
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    db.close();
    db = openDatabase(filename);
    await t.test('dados persistem após reabrir o arquivo', () => {
      assert.equal(db.prepare('SELECT count(*) count FROM appointments').get().count, 2);
      assert.equal(db.prepare('SELECT status FROM appointments WHERE id=?').get(appointmentId).status, 'cancelled');
      assert.equal(db.prepare('SELECT count(*) count FROM services WHERE active=1').get().count, 19);
    });
  } finally {
    if (server.listening) await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
    db.close();
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});
