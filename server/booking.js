import { randomUUID } from 'node:crypto';
import { check, date, integer, minutes, clock, text } from './validation.js';
export const payments = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'];
export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function availability(db, query, now = new Date()) {
  const day = date(query.date),
    barberId = integer(query.barberId, 'Profissional'),
    serviceId = integer(query.serviceId, 'Serviço');
  check(day >= localDate(now) && day <= localDate(new Date(now.getTime() + 90 * 86400000)), 'Escolha uma data entre hoje e os próximos 90 dias.');
  const service = db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(serviceId);
  const barber = db.prepare('SELECT * FROM barbers WHERE id=? AND active=1').get(barberId);
  check(service && barber, 'Serviço ou profissional indisponível.', 404);
  const hours = db.prepare('SELECT * FROM hours WHERE weekday=?').get(new Date(day + 'T12:00:00Z').getUTCDay());
  const occupied = db.prepare("SELECT start,end FROM appointments WHERE barber_id=? AND date=? AND status='confirmed' UNION ALL SELECT start,end FROM blocks WHERE barber_id=? AND date=?").all(barberId, day, barberId, day);
  const slots = [];
  if (!hours.closed) for (let start = hours.opens; start + service.duration <= hours.closes; start += 30) {
    const timestamp = new Date(`${day}T${clock(start)}:00-03:00`).getTime();
    if (timestamp > now.getTime() && !occupied.some(o => start < o.end && start + service.duration > o.start)) slots.push(clock(start));
  }
  return {
    date: day,
    slots,
    service,
    barber
  };
}
export function createAppointment(db, data) {
  const customer = text(data.customer, 'Nome', 90, 2),
    phone = text(data.phone, 'Telefone', 25).replace(/\D/g, '');
  check(phone.length >= 10 && phone.length <= 13, 'Informe um telefone com DDD.');
  check(payments.includes(data.payment), 'Escolha a forma de pagamento.');
  const start = minutes(data.time);
  // A consulta e a gravação compartilham a trava: requisições concorrentes não reservam intervalos sobrepostos.
  db.exec('BEGIN IMMEDIATE');
  try {
    const available = availability(db, data);
    check(available.slots.includes(data.time), 'Este horário não está mais disponível. Escolha outro.', 409);
    const id = randomUUID(),
      {
        service,
        barber
      } = available;
    db.prepare(`INSERT INTO appointments(id,barber_id,service_id,date,start,end,customer,phone,payment,service,barber,price)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, barber.id, service.id, data.date, start, start + service.duration, customer, phone, data.payment, service.name, barber.name, service.price);
    db.exec('COMMIT');
    return {
      id,
      date: data.date,
      time: data.time,
      customer,
      service: service.name,
      barber: barber.name,
      price: service.price,
      payment: data.payment
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
