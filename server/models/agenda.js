import { date } from '../validation.js';
import { stateSql } from './operations.js';
import { expireWalkins } from '../walkins.js';

/** Read models never accept a client-supplied identity instead of the authenticated actor. */
export function customerAgenda(db, customer) {
  expireWalkins(db);
  return {
    appointments: db
      .prepare(
        `SELECT id,date,start,end,service,barber,price,payment,${stateSql} AS status FROM appointments WHERE customer_id=? ORDER BY date DESC,start DESC LIMIT 100`
      )
      .all(customer.id),
    walkins: db
      .prepare(
        'SELECT w.id,w.status,w.expires_at,w.appointment_id,b.name AS barber,s.name AS service FROM walkins w JOIN barbers b ON b.id=w.barber_id JOIN services s ON s.id=w.service_id WHERE w.customer_id=? ORDER BY w.created_at DESC LIMIT 20'
      )
      .all(customer.id)
  };
}
export function dailyAgenda(db, actor, day) {
  return db
    .prepare(
      `SELECT *,${stateSql} AS status FROM appointments WHERE date=? AND (? IS NULL OR barber_id=?) ORDER BY start,barber`
    )
    .all(date(day), actor.barber_id, actor.barber_id);
}
export function dailyBlocks(db, actor, day) {
  return db
    .prepare(
      'SELECT blocks.*,barbers.name AS barber FROM blocks JOIN barbers ON barbers.id=blocks.barber_id WHERE date=? AND (? IS NULL OR barber_id=?) ORDER BY start'
    )
    .all(date(day), actor.barber_id, actor.barber_id);
}
export function pendingWalkins(db, actor) {
  expireWalkins(db);
  return db
    .prepare(
      "SELECT w.id,w.barber_id,w.expires_at,c.name AS customer,c.phone,b.name AS barber,s.name AS service FROM walkins w JOIN customers c ON c.id=w.customer_id JOIN barbers b ON b.id=w.barber_id JOIN services s ON s.id=w.service_id WHERE w.status='pending' AND (? IS NULL OR w.barber_id=?) ORDER BY w.created_at"
    )
    .all(actor.barber_id, actor.barber_id);
}
