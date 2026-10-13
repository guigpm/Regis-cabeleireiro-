import { randomUUID } from 'node:crypto';
import { localDate, localMinute, performer, fits, payments, insertAppointment } from './booking.js';
import { check } from './validation.js';
import { ownBarber } from './permissions.js';
export function expireWalkins(db, now = Date.now()) {
  db.prepare("UPDATE walkins SET status='expired' WHERE status='pending' AND expires_at<=?").run(now);
}
function availableNow(db, barberId, serviceId, now, except = '') {
  const {
      service,
      barber
    } = performer(db, barberId, serviceId),
    day = localDate(now),
    start = localMinute(now);
  check(db.prepare("SELECT id FROM administrators WHERE barber_id=? AND role='BARBER' AND active=1").get(barber.id), 'Este profissional não está habilitado para confirmar pedidos presenciais.', 409);
  check(fits(db, barber.id, day, start, start + service.duration + (except ? 0 : 5), now.getTime(), except), 'Profissional indisponível agora.', 409);
  return {
    service,
    barber,
    day,
    start
  };
}
export function nowOptions(db, now = new Date()) {
  expireWalkins(db, now.getTime());
  const result = [];
  const barbers = db.prepare("SELECT b.id FROM barbers b JOIN administrators a ON a.barber_id=b.id WHERE b.active=1 AND a.active=1 AND a.role='BARBER'").all();
  for (const barber of barbers) for (const service of db.prepare('SELECT id FROM services WHERE active=1').all()) {
    try {
      const option = availableNow(db, barber.id, service.id, now);
      result.push({
        barberId: barber.id,
        serviceId: service.id,
        time: option.start
      });
    } catch (error) {
      if (!error.status) throw error;
    }
  }
  return result;
}
export function requestNow(db, data, customer, now = new Date()) {
  check(customer?.id && customer.cpf && customer.phone, 'Complete seu cadastro.', 403);
  check(payments.includes(data.payment), 'Escolha a forma de pagamento.');
  db.exec('BEGIN IMMEDIATE');
  try {
    expireWalkins(db, now.getTime());
    check(!db.prepare("SELECT id FROM walkins WHERE customer_id=? AND status='pending'").get(customer.id), 'Você já tem uma solicitação aguardando confirmação.', 409);
    const option = availableNow(db, data.barberId, data.serviceId, now),
      id = randomUUID(),
      expires = now.getTime() + 5 * 60000;
    db.prepare('INSERT INTO walkins(id,customer_id,barber_id,service_id,date,start,end,payment,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, customer.id, option.barber.id, option.service.id, option.day, option.start, option.start + option.service.duration + 5, data.payment, expires);
    db.exec('COMMIT');
    return {
      id,
      status: 'pending',
      expiresAt: expires
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export function decideNow(db, admin, id, decision, now = new Date()) {
  check(['accept', 'reject'].includes(decision), 'Decisão inválida.');
  expireWalkins(db, now.getTime());
  db.exec('BEGIN IMMEDIATE');
  try {
    const item = db.prepare("SELECT * FROM walkins WHERE id=? AND status='pending'").get(id);
    check(item, 'Solicitação já respondida ou expirada.', 409);
    ownBarber(admin, item.barber_id);
    if (decision === 'reject') {
      db.prepare("UPDATE walkins SET status='rejected' WHERE id=?").run(id);
      db.exec('COMMIT');
      return {
        status: 'rejected'
      };
    }
    check(admin.role === 'BARBER' && admin.barber_id === item.barber_id, 'A confirmação presencial deve ser feita pelo cabeleireiro selecionado.', 403);
    const option = availableNow(db, item.barber_id, item.service_id, now, id);
    const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(item.customer_id);
    const appointment = insertAppointment(db, {
      date: option.day,
      payment: item.payment
    }, customer, option.service, option.barber, option.start);
    db.prepare("UPDATE walkins SET status='confirmed',appointment_id=? WHERE id=?").run(appointment.id, id);
    db.exec('COMMIT');
    return {
      status: 'confirmed',
      appointment
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
