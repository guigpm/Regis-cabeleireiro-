import { effectiveHours } from './models/schedule.js';
import { randomUUID } from 'node:crypto';
import { check, date, integer, minutes, clock } from './validation.js';
export const payments = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'];
export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function localMinute(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  return (
    Number(parts.find((p) => p.type === 'hour').value) * 60 +
    Number(parts.find((p) => p.type === 'minute').value) +
    (now.getUTCSeconds() > 0 ? 1 : 0)
  );
}
export function performer(db, barberId, serviceId) {
  const service = db
    .prepare('SELECT * FROM services WHERE id=? AND active=1')
    .get(integer(serviceId, 'Serviço'));
  const barber = db
    .prepare('SELECT * FROM barbers WHERE id=? AND active=1')
    .get(integer(barberId, 'Profissional'));
  check(service && barber, 'Serviço ou profissional indisponível.', 404);
  check(
    barber.all_services ||
      db
        .prepare('SELECT 1 FROM barber_services WHERE barber_id=? AND service_id=?')
        .get(barber.id, service.id),
    'Este profissional não executa o serviço escolhido.',
    400
  );
  return {
    service,
    barber
  };
}
export function occupiedIntervals(db, barberId, day, now = Date.now(), except = '') {
  return db
    .prepare(
      `SELECT start,end,'occupied' AS kind FROM appointments WHERE barber_id=? AND date=? AND status='confirmed'
    UNION ALL SELECT start,end,'blocked' AS kind FROM blocks WHERE barber_id=? AND date=?
    UNION ALL SELECT start,end,'pending' AS kind FROM walkins WHERE barber_id=? AND date=? AND status='pending' AND expires_at>? AND id<>?`
    )
    .all(barberId, day, barberId, day, barberId, day, now, except);
}
export function fits(db, barberId, day, start, end, now = Date.now(), except = '') {
  const hours = effectiveHours(db, barberId, day);
  return (
    !hours.closed &&
    start >= hours.opens &&
    end <= hours.closes &&
    !occupiedIntervals(db, barberId, day, now, except).some((o) => start < o.end && end > o.start)
  );
}
export function availability(db, query, now = new Date()) {
  const day = date(query.date),
    { service, barber } = performer(db, query.barberId, query.serviceId);
  check(
    day >= localDate(now) && day <= localDate(new Date(now.getTime() + 90 * 86400000)),
    'Escolha uma data entre hoje e os próximos 90 dias.'
  );
  const hours = effectiveHours(db, barber.id, day);
  const occupied = occupiedIntervals(db, barber.id, day, now.getTime());
  const slots = [],
    timeline = [];
  if (!hours.closed)
    for (let start = hours.opens; start + service.duration <= hours.closes; start += 30) {
      const past = new Date(`${day}T${clock(start)}:00-03:00`).getTime() <= now.getTime();
      const busy = occupied.some((o) => start < o.end && start + service.duration > o.start);
      const state = past ? 'past' : busy ? 'occupied' : 'available';
      timeline.push({
        time: clock(start),
        state
      });
      if (state === 'available') slots.push(clock(start));
    }
  return {
    date: day,
    slots,
    timeline,
    occupied: occupied.map((o) => ({
      start: clock(o.start),
      end: clock(o.end)
    })),
    service,
    barber
  };
}
export function insertAppointment(db, data, customer, service, barber, start) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO appointments(id,barber_id,service_id,date,start,end,customer,phone,payment,service,barber,price,customer_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    barber.id,
    service.id,
    data.date,
    start,
    start + service.duration,
    customer.name,
    customer.phone,
    data.payment,
    service.name,
    barber.name,
    service.price,
    customer.id
  );
  return {
    id,
    date: data.date,
    time: clock(start),
    customer: customer.name,
    service: service.name,
    barber: barber.name,
    price: service.price,
    payment: data.payment
  };
}
export function createAppointment(db, data, customer) {
  check(
    customer?.id && customer.cpf && customer.phone,
    'Entre e complete seu cadastro para agendar.',
    401
  );
  check(payments.includes(data.payment), 'Escolha a forma de pagamento.');
  const start = minutes(data.time);
  db.exec('BEGIN IMMEDIATE');
  try {
    const available = availability(db, data);
    check(
      available.slots.includes(data.time),
      'Este horário não está mais disponível. Escolha outro.',
      409
    );
    const result = insertAppointment(
      db,
      data,
      customer,
      available.service,
      available.barber,
      start
    );
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
