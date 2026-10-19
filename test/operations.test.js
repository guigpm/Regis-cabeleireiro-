import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { localDate, fits, availability } from '../server/booking.js';
import { blockSchedule, changeBlock, personalHours } from '../server/models/schedule.js';
import {
  transition,
  appointmentProducts,
  sell,
  commission,
  report,
  history,
  customerCancel
} from '../server/models/operations.js';
import { secureFetch } from './helpers/http.js';
const password = 'strong-test-password-123';
function fixture() {
  const db = openDatabase(':memory:');
  createAuth(db, { password });
  db.exec(
    "INSERT INTO administrators(username,name,password_hash,role,barber_id) SELECT 'barber','Barber',password_hash,'BARBER',1 FROM administrators WHERE username='root'; INSERT INTO customers(id,name,email,cpf,phone) VALUES(1,'Cliente','test@example.test','52998224725','41999990000');"
  );
  return {
    db,
    root: db.prepare("SELECT * FROM administrators WHERE role='ROOT'").get(),
    barber: db.prepare("SELECT * FROM administrators WHERE role='BARBER'").get()
  };
}
function appointment(db, id, day = localDate(), barber = 1) {
  db.prepare(
    `INSERT INTO appointments(id,barber_id,service_id,date,start,end,customer,phone,payment,service,barber,price,customer_id) VALUES(?,?,1,?,540,570,'Cliente','41999990000','Pix','Corte','Profissional',100,1)`
  ).run(id, barber, day);
}
test('expediente pessoal, exceções e prioridade dos bloqueios ROOT', () => {
  const { db, root, barber } = fixture();
  try {
    const day = '2099-10-15';
    personalHours(db, barber, 1, 'PUT', {
      date: day,
      opens: '06:15',
      closes: '23:45',
      closed: false
    });
    assert.equal(fits(db, 1, day, 375, 405), true);
    const block = blockSchedule(db, root, {
      barberId: 1,
      date: day,
      fullDay: true,
      reason: 'Falta'
    });
    assert.equal(fits(db, 1, day, 375, 405), false);
    assert.throws(() => changeBlock(db, barber, block.id, 'DELETE'), { status: 403 });
    assert.throws(() => changeBlock(db, barber, block.id, 'PATCH', { releaseFrom: '12:00' }), {
      status: 403
    });
    personalHours(db, barber, 1, 'PUT', {
      date: day,
      opens: '00:00',
      closes: '24:00',
      closed: false
    });
    assert.equal(fits(db, 1, day, 375, 405), false);
    changeBlock(db, root, block.id, 'PATCH', { releaseFrom: '12:00' });
    assert.equal(fits(db, 1, day, 720, 750), true);
    assert.equal(fits(db, 1, day, 690, 750), false);
    const lunch = blockSchedule(db, barber, {
      barberId: 1,
      date: day,
      start: '13:15',
      end: '14:45',
      reason: 'Almoço'
    });
    assert.equal(fits(db, 1, day, 810, 840), false);
    changeBlock(db, barber, lunch.id, 'DELETE');
    assert.throws(() => personalHours(db, barber, 2, 'PUT', {}), { status: 403 });
  } finally {
    db.close();
  }
});
test('atendimento: transições, pagamento obrigatório, comissão histórica e produtos atômicos', () => {
  const { db, root, barber } = fixture();
  try {
    appointment(db, 'a');
    assert.throws(() => transition(db, barber, 'a', { status: 'completed', payment: 'Pix' }), {
      status: 409
    });
    transition(db, barber, 'a', { status: 'in_progress' });
    assert.throws(() => customerCancel(db, { id: 1 }, 'a'), { status: 409 });
    assert.throws(
      () =>
        transition(db, { ...barber, barber_id: 2 }, 'a', { status: 'completed', payment: 'Pix' }),
      { status: 403 }
    );
    db.prepare('UPDATE products SET price=20,stock=1 WHERE id=1').run();
    appointmentProducts(db, barber, 'a', { items: [{ productId: 1, quantity: 2 }] });
    assert.throws(
      () => transition(db, barber, 'a', { status: 'completed', payment: 'Cartão de Débito' }),
      { status: 400 }
    );
    assert.throws(() => transition(db, barber, 'a', { status: 'completed', payment: 'Pix' }), {
      status: 409
    });
    assert.equal(db.prepare('SELECT count(*) n FROM ledger').get().n, 0);
    assert.equal(
      db.prepare("SELECT work_status FROM appointments WHERE id='a'").get().work_status,
      'in_progress'
    );
    db.prepare('UPDATE products SET stock=10 WHERE id=1').run();
    transition(db, barber, 'a', {
      status: 'completed',
      payment: 'Cartão de Débito',
      cardBrand: 'Visa'
    });
    assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, 8);
    const result = report(db, barber, { from: localDate(), to: localDate() });
    assert.equal(result.totals.grossCents, 14000);
    assert.equal(result.totals.commissionCents, 6300);
    assert.equal(result.breakdown.find((b) => b.kind === 'service').quantity, 1);
    assert.equal(result.breakdown.find((b) => b.kind === 'product').quantity, 2);
    assert.throws(() => transition(db, barber, 'a', { status: 'completed', payment: 'Pix' }), {
      status: 409
    });
    assert.throws(() => transition(db, root, 'a', { status: 'cancelled' }), { status: 409 });
    assert.throws(() => appointmentProducts(db, barber, 'a', { items: [] }), { status: 409 });
    commission(db, root, 1, { percent: 60 });
    assert.equal(report(db, barber, {}).totals.commissionCents, 6300);
    assert.throws(() => commission(db, barber, 1, { percent: 100 }), { status: 403 });
    assert.equal(report(db, barber, { kind: 'product' }).totals.commissionCents, 1800);
    assert.equal(report(db, root, { barberId: 2 }).totals.commissionCents, 0);
    assert.throws(() => report(db, barber, { barberId: 2 }), { status: 403 });
  } finally {
    db.close();
  }
});
test('venda avulsa: idempotência, escopo, quantidade e valores calculados no servidor', () => {
  const { db, root, barber } = fixture();
  try {
    db.prepare('UPDATE products SET price=20,stock=5 WHERE id=1').run();
    appointment(db, 'a');
    transition(db, barber, 'a', { status: 'in_progress' });
    const data = {
      requestId: 'idempotent-sale-key-0001',
      items: [{ productId: 1, quantity: 2, price: 0 }],
      payment: 'Pix',
      price: 0,
      commission: 100
    };
    assert.throws(() => sell(db, barber, data), { status: 409 });
    const sale = sell(db, barber, { ...data, standalone: true });
    assert.equal(sell(db, barber, { ...data, standalone: true }).id, sale.id);
    assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, 3);
    assert.equal(report(db, barber, { kind: 'product' }).totals.grossCents, 4000);
    assert.equal(report(db, barber, { kind: 'product' }).totals.commissionCents, 1800);
    assert.throws(() => sell(db, barber, { ...data, barberId: 2 }), { status: 403 });
    assert.throws(() =>
      sell(db, root, {
        ...data,
        barberId: 1,
        requestId: 'different-sale-key',
        items: [{ productId: 1, quantity: -2 }]
      })
    );
    appointment(db, 'old', '2010-01-01');
    appointment(db, 'other', '2010-01-01', 2);
    assert.equal(history(db, barber, {}).total, 2);
    assert.equal(history(db, root, {}).total, 3);
    assert.equal(history(db, root, { from: '2010-01-01', to: '2010-01-01' }).total, 2);
    assert.equal(history(db, barber, { limit: 1, offset: 1 }).items[0].id, 'old');
  } finally {
    db.close();
  }
});
test('segurança HTTP: CSRF, CSP, origem, arquivos privados e escopo das novas APIs', async () => {
  const { db } = fixture(),
    server = createApp(db, { password });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const raw = await fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root', password })
    });
    assert.equal(raw.status, 403);
    const login = await secureFetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'barber', password })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const path of [
      '/api/admin/reports?barberId=2',
      '/api/admin/history?barberId=2',
      '/api/admin/barbers/2/hours'
    ])
      assert.equal((await fetch(base + path, { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await fetch(base + '/api/admin/history')).status, 401);
    assert.equal(
      (
        await secureFetch(base + '/api/admin/logout', {
          method: 'POST',
          headers: { Cookie: cookie, Origin: 'https://attacker.test' }
        })
      ).status,
      403
    );
    for (const path of ['/server/models/operations.js', '/.env', '/assets/secret.sqlite'])
      assert.equal((await fetch(base + path)).status, 404);
    const panel = await fetch(base + '/painel');
    assert.match(panel.headers.get('content-security-policy'), /script-src-attr 'none'/);
    assert.doesNotMatch(await panel.text(), /\son(?:click|submit|error)=/);
    assert.equal((await fetch(base + '/sw.js')).status, 200);
    const csrf = await fetch(base + '/api/csrf');
    const token = (await csrf.json()).token;
    const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    assert.equal(
      (
        await fetch(base + '/api/admin/logout', {
          method: 'POST',
          headers: { Cookie: cookie + '; rr_csrf=' + tampered, 'X-CSRF-Token': tampered }
        })
      ).status,
      403
    );
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
    db.close();
  }
});
