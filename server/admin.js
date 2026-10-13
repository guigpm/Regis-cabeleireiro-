import { occupiedIntervals } from './booking.js';
import { check, integer, text, price, image, date, minutes } from './validation.js';
const fields = {
  services: ['name', 'price', 'duration'],
  barbers: ['name', 'spec', 'photo'],
  products: ['name', 'price', 'category', 'image']
};
function record(kind, data) {
  const result = {
    name: text(data.name, 'Nome', 100, 2)
  };
  if (kind === 'services') Object.assign(result, {
    price: price(data.price),
    duration: integer(data.duration, 'Duração', 5, 480)
  });
  if (kind === 'barbers') Object.assign(result, {
    spec: text(data.spec, 'Especialidade', 100),
    photo: image(data.photo)
  });
  if (kind === 'products') {
    check(['Cabelo', 'Barba', 'Acabamento'].includes(data.category), 'Categoria inválida.');
    Object.assign(result, {
      price: price(data.price),
      category: data.category,
      image: image(data.image)
    });
  }
  return result;
}
export function catalogMutation(db, kind, id, method, data) {
  check(Object.hasOwn(fields, kind), 'Cadastro inexistente.', 404);
  if (id) check(db.prepare(`SELECT id FROM ${kind} WHERE id=? AND active=1`).get(integer(id, 'ID')), 'Registro inexistente.', 404);
  if (method === 'DELETE' && id) {
    db.prepare(`UPDATE ${kind} SET active=0 WHERE id=?`).run(Number(id));
    return {
      ok: true
    };
  }
  check(method === 'POST' && !id || method === 'PUT' && id, 'Operação inválida.', 405);
  const value = record(kind, data),
    columns = fields[kind];
  if (id) db.prepare(`UPDATE ${kind} SET ${columns.map(c => `${c}=?`).join(',')} WHERE id=?`).run(...columns.map(c => value[c]), Number(id));else id = db.prepare(`INSERT INTO ${kind}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`).run(...columns.map(c => value[c])).lastInsertRowid;
  return {
    id: Number(id),
    ...value
  };
}
export function updateHours(db, rows) {
  check(Array.isArray(rows) && rows.length === 7, 'Informe os sete dias da semana.');
  const seen = new Set();
  const valid = rows.map(row => {
    const weekday = integer(row.weekday, 'Dia', 0, 6),
      opens = minutes(row.opens),
      closes = minutes(row.closes);
    check(!seen.has(weekday), 'Dia repetido.');
    seen.add(weekday);
    check(typeof row.closed === 'boolean', 'Situação do dia inválida.');
    check(opens < closes, 'O fechamento deve ser após a abertura.');
    return {
      weekday,
      opens,
      closes,
      closed: row.closed ? 1 : 0
    };
  });
  db.exec('BEGIN IMMEDIATE');
  try {
    const stmt = db.prepare('UPDATE hours SET opens=?,closes=?,closed=? WHERE weekday=?');
    for (const row of valid) stmt.run(row.opens, row.closes, row.closed, row.weekday);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    ok: true
  };
}
export function addBlock(db, data) {
  const barberId = integer(data.barberId, 'Profissional'),
    day = date(data.date),
    start = minutes(data.start),
    end = minutes(data.end),
    reason = text(data.reason, 'Motivo', 150);
  check(start < end, 'O fim do bloqueio deve ser após o início.');
  check(db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(barberId), 'Profissional inexistente.', 404);
  db.exec('BEGIN IMMEDIATE');
  try {
    check(!occupiedIntervals(db, barberId, day).some(item => start < item.end && end > item.start), 'Há um agendamento nesse intervalo. Cancele-o antes de bloquear.', 409);
    const result = db.prepare('INSERT INTO blocks(barber_id,date,start,end,reason) VALUES(?,?,?,?,?)').run(barberId, day, start, end, reason);
    db.exec('COMMIT');
    return {
      id: Number(result.lastInsertRowid)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
