import { check, integer, date, minutes, text } from '../validation.js';
import { ownBarber } from '../permissions.js';
import { transaction } from './operations.js';

/** Day exceptions override personal weekly hours, then fall back to the ROOT defaults. */
export function effectiveHours(db, barberId, day) {
  const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
  return (
    db.prepare('SELECT * FROM barber_days WHERE barber_id=? AND date=?').get(barberId, day) ||
    db
      .prepare('SELECT * FROM barber_hours WHERE barber_id=? AND weekday=?')
      .get(barberId, weekday) ||
    db.prepare('SELECT * FROM hours WHERE weekday=?').get(weekday)
  );
}
export function personalHours(db, actor, id, method, data = {}) {
  const barber = integer(id, 'Profissional');
  ownBarber(actor, barber);
  check(
    db.prepare('SELECT id FROM barbers WHERE id=?').get(barber),
    'Profissional inexistente.',
    404
  );
  if (method === 'GET')
    return {
      weekly: db
        .prepare(
          'SELECT h.weekday,COALESCE(b.opens,h.opens) opens,COALESCE(b.closes,h.closes) closes,COALESCE(b.closed,h.closed) closed FROM hours h LEFT JOIN barber_hours b ON b.weekday=h.weekday AND b.barber_id=? ORDER BY h.weekday'
        )
        .all(barber),
      exceptions: db
        .prepare('SELECT * FROM barber_days WHERE barber_id=? ORDER BY date DESC')
        .all(barber)
    };
  if (method === 'DELETE') {
    db.prepare('DELETE FROM barber_days WHERE barber_id=? AND date=?').run(barber, date(data.date));
    return { ok: true };
  }
  check(method === 'PUT', 'Método inválido.', 405);
  function row(input) {
    const opens = minutes(input.opens),
      closes = input.closes === '24:00' ? 1440 : minutes(input.closes);
    check(opens < closes && typeof input.closed === 'boolean', 'Expediente inválido.');
    return [opens, closes, input.closed ? 1 : 0];
  }
  return transaction(db, () => {
    if (data.date) {
      db.prepare(
        'INSERT INTO barber_days(barber_id,date,opens,closes,closed) VALUES(?,?,?,?,?) ON CONFLICT(barber_id,date) DO UPDATE SET opens=excluded.opens,closes=excluded.closes,closed=excluded.closed'
      ).run(barber, date(data.date), ...row(data));
    } else {
      check(Array.isArray(data.hours) && data.hours.length === 7, 'Informe os sete dias.');
      const seen = new Set();
      for (const input of data.hours) {
        const weekday = integer(input.weekday, 'Dia', 0, 6);
        check(!seen.has(weekday), 'Dia repetido.');
        seen.add(weekday);
        db.prepare(
          'INSERT INTO barber_hours VALUES(?,?,?,?,?) ON CONFLICT(barber_id,weekday) DO UPDATE SET opens=excluded.opens,closes=excluded.closes,closed=excluded.closed'
        ).run(barber, weekday, ...row(input));
      }
    }
    return { ok: true };
  });
}
/** ROOT restrictions remain independent from personal hours and cannot be edited by BARBER. */
export function blockSchedule(db, actor, data) {
  const barber = integer(data.barberId, 'Profissional');
  ownBarber(actor, barber);
  const day = date(data.date),
    start = data.fullDay === true ? 0 : minutes(data.start),
    end = data.fullDay === true || data.end === '24:00' ? 1440 : minutes(data.end);
  check(start < end, 'Intervalo inválido.');
  check(
    db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(barber),
    'Profissional inexistente.',
    404
  );
  const reason = text(data.reason, 'Motivo', 150);
  return transaction(db, () => {
    const affected = db
      .prepare(
        "SELECT count(*) n FROM appointments WHERE barber_id=? AND date=? AND status='confirmed' AND work_status<>'completed' AND start<? AND end>?"
      )
      .get(barber, day, end, start).n;
    check(
      actor.role === 'ROOT' || affected === 0,
      'Existem atendimentos neste intervalo. Reorganize a agenda antes de bloquear.',
      409
    );
    const result = db
      .prepare(
        'INSERT INTO blocks(barber_id,date,start,end,reason,source_role,created_by) VALUES(?,?,?,?,?,?,?)'
      )
      .run(barber, day, start, end, reason, actor.role, actor.id);
    return { id: Number(result.lastInsertRowid), affectedAppointments: affected };
  });
}
export function changeBlock(db, actor, id, method, data = {}) {
  return transaction(db, () => {
    const block = db.prepare('SELECT * FROM blocks WHERE id=?').get(integer(id, 'Bloqueio'));
    check(block, 'Bloqueio inexistente.', 404);
    ownBarber(actor, block.barber_id);
    check(
      actor.role === 'ROOT' || block.source_role !== 'ROOT',
      'Somente o ROOT pode remover ou reduzir esta restrição.',
      403
    );
    if (method === 'DELETE') db.prepare('DELETE FROM blocks WHERE id=?').run(block.id);
    else {
      const end = minutes(data.releaseFrom);
      check(
        end > block.start && end < block.end,
        'A liberação deve estar dentro do intervalo bloqueado.'
      );
      db.prepare('UPDATE blocks SET end=? WHERE id=?').run(end, block.id);
    }
    return { ok: true };
  });
}
