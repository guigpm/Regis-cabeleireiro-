import { randomUUID } from 'node:crypto';
import { check, integer, date, minutes, text } from '../validation.js';
import { ownBarber, root } from '../permissions.js';
import { localDate, localMinute, payments } from '../booking.js';

/** Atomic changes keep the financial ledger, inventory and appointment in agreement. */
export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export const stateSql =
  "CASE WHEN status='cancelled' THEN 'cancelled' WHEN work_status='scheduled' THEN 'confirmed' ELSE work_status END";
export function scope(actor, requested) {
  if (requested) {
    const id = integer(requested, 'Profissional');
    ownBarber(actor, id);
    return id;
  }
  return actor.role === 'ROOT' ? null : actor.barber_id;
}
export function interval(query) {
  const from = date(query.from || query.date || '0001-01-01');
  const to = date(query.to || query.date || '9999-12-31');
  check(from <= to, 'Período inválido.');
  return { from, to };
}
/** Paginated history has no date cutoff; only the authenticated actor determines scope. */
export function history(db, actor, query) {
  const { from, to } = interval(query),
    barber = scope(actor, query.barberId);
  const limit = integer(query.limit || 50, 'Limite', 1, 100),
    offset = integer(query.offset || 0, 'Página', 0);
  const state = query.status || '';
  check(
    ['', 'confirmed', 'in_progress', 'completed', 'cancelled'].includes(state),
    'Situação inválida.'
  );
  const where = `date BETWEEN ? AND ? AND (? IS NULL OR barber_id=?) AND (?='' OR (${stateSql})=?)`;
  const params = [from, to, barber, barber, state, state];
  return {
    total: db.prepare(`SELECT count(*) n FROM appointments WHERE ${where}`).get(...params).n,
    items: db
      .prepare(
        `SELECT *,${stateSql} AS status FROM appointments WHERE ${where} ORDER BY date DESC,start DESC,id LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset),
    limit,
    offset
  };
}
export function getAppointment(db, actor, id) {
  const item = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
  check(item, 'Atendimento inexistente.', 404);
  ownBarber(actor, item.barber_id);
  return item;
}
function payment(data) {
  check(payments.includes(data.payment), 'Informe a forma de pagamento realizada.');
  const card = data.payment.startsWith('Cartão');
  const brand = card ? text(data.cardBrand, 'Bandeira do cartão', 40, 2) : '';
  return { method: data.payment, brand };
}
function audit(db, actor, action, target) {
  db.prepare('INSERT INTO audit_events(actor_id,action,target) VALUES(?,?,?)').run(
    actor.id,
    action,
    String(target)
  );
}
function rate(db, barberId) {
  return db.prepare('SELECT commission_bps FROM barbers WHERE id=?').get(barberId).commission_bps;
}
/** Snapshots use cents and basis points; later price/rate changes cannot rewrite earnings. */
function ledger(
  db,
  actor,
  { barber, appointment = null, sale = null, kind, itemId, name, quantity, unit, pay, commission }
) {
  const gross = unit * quantity,
    earned = Math.round((gross * commission) / 10000);
  db.prepare(
    `INSERT INTO ledger(barber_id,appointment_id,sale_id,kind,item_id,name,quantity,unit_cents,gross_cents,commission_bps,commission_cents,payment,card_brand,date,actor_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    barber,
    appointment,
    sale,
    kind,
    itemId,
    name,
    quantity,
    unit,
    gross,
    commission,
    earned,
    pay.method,
    pay.brand,
    localDate(),
    actor.id
  );
}
function sellStock(db, productId, quantity) {
  const product = db.prepare('SELECT stock FROM products WHERE id=?').get(productId);
  check(product, 'Produto inexistente.', 404);
  if (product.stock !== null) {
    check(
      db
        .prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?')
        .run(quantity, productId, quantity).changes,
      'Estoque insuficiente.',
      409
    );
  }
}
export function transition(db, actor, id, data) {
  return transaction(db, () => {
    const item = getAppointment(db, actor, id);
    check(
      item.status !== 'cancelled' && item.work_status !== 'completed',
      'Atendimento já encerrado.',
      409
    );
    check(['in_progress', 'completed', 'cancelled'].includes(data.status), 'Situação inválida.');
    if (data.status === 'in_progress') {
      check(item.work_status === 'scheduled', 'Atendimento já iniciado.', 409);
      check(item.date <= localDate(), 'Não é possível iniciar um atendimento futuro.', 409);
      check(
        !db
          .prepare(
            "SELECT id FROM appointments WHERE barber_id=? AND work_status='in_progress' AND status='confirmed'"
          )
          .get(item.barber_id),
        'Já existe um atendimento em andamento.',
        409
      );
      db.prepare(
        "UPDATE appointments SET work_status='in_progress',started_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(id);
    } else if (data.status === 'cancelled') {
      db.prepare("UPDATE appointments SET status='cancelled' WHERE id=?").run(id);
    } else {
      check(item.work_status === 'in_progress', 'Inicie o atendimento antes de concluí-lo.', 409);
      const pay = payment(data),
        commission = rate(db, item.barber_id);
      ledger(db, actor, {
        barber: item.barber_id,
        appointment: id,
        kind: 'service',
        itemId: item.service_id,
        name: item.service,
        quantity: 1,
        unit: Math.round(item.price * 100),
        pay,
        commission
      });
      for (const line of db
        .prepare('SELECT * FROM appointment_products WHERE appointment_id=?')
        .all(id)) {
        sellStock(db, line.product_id, line.quantity);
        ledger(db, actor, {
          barber: item.barber_id,
          appointment: id,
          kind: 'product',
          itemId: line.product_id,
          name: line.name,
          quantity: line.quantity,
          unit: line.unit_cents,
          pay,
          commission
        });
      }
      db.prepare(
        "UPDATE appointments SET work_status='completed',completed_at=CURRENT_TIMESTAMP,payment=?,card_brand=? WHERE id=?"
      ).run(pay.method, pay.brand, id);
    }
    audit(db, actor, 'appointment.' + data.status, id);
    return { ok: true };
  });
}
export function customerCancel(db, customer, id) {
  check(
    db
      .prepare(
        "UPDATE appointments SET status='cancelled' WHERE id=? AND customer_id=? AND status='confirmed' AND work_status='scheduled' AND (date>? OR (date=? AND start>?))"
      )
      .run(id, customer.id, localDate(), localDate(), localMinute()).changes,
    'Somente agendamentos futuros ainda não iniciados podem ser cancelados.',
    409
  );
  return { ok: true };
}
function productLines(db, lines) {
  check(
    Array.isArray(lines) && lines.length > 0 && lines.length <= 50,
    'Informe de 1 a 50 produtos.'
  );
  const seen = new Set();
  return lines.map((line) => {
    const id = integer(line.productId, 'Produto'),
      quantity = integer(line.quantity, 'Quantidade', 1, 1000);
    check(!seen.has(id), 'Produto repetido. Ajuste a quantidade.');
    seen.add(id);
    const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
    check(product, 'Produto indisponível.', 404);
    return { ...product, quantity, unit: Math.round(product.price * 100) };
  });
}
export function appointmentProducts(db, actor, id, data) {
  return transaction(db, () => {
    const item = getAppointment(db, actor, id);
    check(
      item.status === 'confirmed' && item.work_status === 'in_progress',
      'Produtos só podem ser alterados durante o atendimento.',
      409
    );
    const lines = data.items?.length === 0 ? [] : productLines(db, data.items);
    db.prepare('DELETE FROM appointment_products WHERE appointment_id=?').run(id);
    for (const line of lines)
      db.prepare('INSERT INTO appointment_products VALUES(?,?,?,?,?)').run(
        id,
        line.id,
        line.name,
        line.quantity,
        line.unit
      );
    audit(db, actor, 'appointment.products', id);
    return { ok: true };
  });
}
export function sell(db, actor, data) {
  const barber = scope(actor, data.barberId);
  check(barber, 'Selecione o profissional responsável.');
  check(
    db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(barber),
    'Profissional indisponível.'
  );
  const key = text(data.requestId, 'Identificador da venda', 80, 16);
  return transaction(db, () => {
    const previous = db.prepare('SELECT * FROM sales WHERE request_key=?').get(key);
    if (previous) {
      check(
        previous.barber_id === barber && previous.actor_id === actor.id,
        'Identificador já utilizado.',
        409
      );
      return { id: previous.id };
    }
    // A standalone sale must be an explicit choice when a service is underway.
    const current = db
      .prepare(
        "SELECT id FROM appointments WHERE barber_id=? AND status='confirmed' AND work_status='in_progress'"
      )
      .get(barber);
    check(
      !current || data.standalone === true,
      'Há um atendimento em andamento. Vincule os produtos ou confirme uma venda separada.',
      409
    );
    const lines = productLines(db, data.items),
      pay = payment(data),
      id = randomUUID(),
      commission = rate(db, barber);
    db.prepare('INSERT INTO sales(id,barber_id,actor_id,request_key) VALUES(?,?,?,?)').run(
      id,
      barber,
      actor.id,
      key
    );
    for (const line of lines) {
      sellStock(db, line.id, line.quantity);
      ledger(db, actor, {
        barber,
        sale: id,
        kind: 'product',
        itemId: line.id,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        pay,
        commission
      });
    }
    audit(db, actor, 'sale.completed', id);
    return { id };
  });
}
export function commission(db, actor, id, data) {
  root(actor);
  const value = Number(data.percent);
  check(
    data.percent !== '' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100 &&
      Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    'Comissão deve estar entre 0 e 100%, com até duas casas decimais.'
  );
  return transaction(db, () => {
    check(
      db
        .prepare('UPDATE barbers SET commission_bps=? WHERE id=?')
        .run(Math.round(value * 100), integer(id, 'Profissional')).changes,
      'Profissional inexistente.',
      404
    );
    audit(db, actor, 'commission.changed', id);
    return { ok: true };
  });
}
/** Totals cover the entire filter, independently from the paginated sales details. */
export function report(db, actor, query) {
  const { from, to } = interval(query),
    barber = scope(actor, query.barberId),
    kind = query.kind || '';
  check(['', 'service', 'product'].includes(kind), 'Tipo inválido.');
  const method = query.payment || '',
    brand = query.cardBrand || '';
  check(!method || payments.includes(method), 'Pagamento inválido.');
  check(typeof brand === 'string' && brand.length <= 40, 'Bandeira inválida.');
  const offset = integer(query.offset || 0, 'Página', 0),
    limit = 50;
  const where = `l.date BETWEEN ? AND ? AND (? IS NULL OR l.barber_id=?) AND (?='' OR l.kind=?) AND (?='' OR l.payment=?) AND (?='' OR l.card_brand=?)`;
  const params = [from, to, barber, barber, kind, kind, method, method, brand, brand];
  const totals = db
    .prepare(
      `SELECT count(*) lines,COALESCE(SUM(gross_cents),0) grossCents,COALESCE(SUM(commission_cents),0) commissionCents FROM ledger l WHERE ${where}`
    )
    .get(...params);
  const breakdown = db
    .prepare(
      `SELECT kind,item_id,name,SUM(quantity) quantity,SUM(gross_cents) grossCents,SUM(commission_cents) commissionCents FROM ledger l WHERE ${where} GROUP BY kind,item_id,name ORDER BY kind,name`
    )
    .all(...params);
  const items = db
    .prepare(
      `SELECT l.*,b.name barber FROM ledger l JOIN barbers b ON b.id=l.barber_id WHERE ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);
  const projected =
    kind === 'product' || method || brand
      ? 0
      : db
          .prepare(
            `SELECT COALESCE(SUM(ROUND(a.price*100*b.commission_bps/10000)),0) total FROM appointments a JOIN barbers b ON b.id=a.barber_id WHERE a.date BETWEEN ? AND ? AND a.status='confirmed' AND a.work_status<>'completed' AND (? IS NULL OR a.barber_id=?)`
          )
          .get(from, to, barber, barber).total;
  return { from, to, totals, breakdown, items, offset, limit, projectedCommissionCents: projected };
}

/** Only ROOT can reconcile stock; completing a sale performs automatic stock deductions. */
export function setStock(db, actor, id, data) {
  root(actor);
  const value = data.stock === null ? null : integer(data.stock, 'Estoque', 0, 1000000);
  return transaction(db, () => {
    check(
      db.prepare('UPDATE products SET stock=? WHERE id=?').run(value, integer(id, 'Produto'))
        .changes,
      'Produto inexistente.',
      404
    );
    audit(db, actor, 'stock.adjusted', id);
    return { ok: true };
  });
}
export function attachedProducts(db, actor, id) {
  getAppointment(db, actor, id);
  return db.prepare('SELECT * FROM appointment_products WHERE appointment_id=?').all(id);
}
