import { check, integer, text } from './validation.js';
import { passwordHash, adminView } from './auth.js';
export function root(admin) {
  check(admin.role === 'ROOT', 'Esta operação é exclusiva do ROOT.', 403);
}
export function ownBarber(admin, barberId) {
  check(
    admin.role === 'ROOT' || admin.barber_id === Number(barberId),
    'Você só pode gerenciar a sua agenda e os seus serviços.',
    403
  );
}
export function serviceSelection(db, admin, barberId, data) {
  ownBarber(admin, barberId);
  const id = integer(barberId, 'Profissional');
  check(
    db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(id),
    'Profissional não encontrado.',
    404
  );
  check(
    typeof data.allServices === 'boolean' && Array.isArray(data.serviceIds),
    'Seleção de serviços inválida.'
  );
  const ids = [...new Set(data.serviceIds.map((value) => integer(value, 'Serviço')))];
  check(
    ids.every((serviceId) =>
      db.prepare('SELECT id FROM services WHERE id=? AND active=1').get(serviceId)
    ),
    'Serviço indisponível.'
  );
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE barbers SET all_services=? WHERE id=?').run(data.allServices ? 1 : 0, id);
    db.prepare('DELETE FROM barber_services WHERE barber_id=?').run(id);
    for (const serviceId of ids)
      db.prepare('INSERT INTO barber_services VALUES(?,?)').run(id, serviceId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    ok: true
  };
}
export function adminAccounts(db, actor, method, id, data) {
  root(actor);
  if (method === 'GET')
    return db
      .prepare('SELECT * FROM administrators ORDER BY id')
      .all()
      .map((a) => ({
        ...adminView(a),
        active: Boolean(a.active)
      }));
  const previous = id
    ? db.prepare('SELECT * FROM administrators WHERE id=?').get(integer(id, 'Administrador'))
    : null;
  check(!id || previous, 'Administrador não encontrado.', 404);
  if (method === 'DELETE') {
    check(
      previous && previous.id !== actor.id && previous.username !== 'root',
      'Não é possível desativar esta conta.'
    );
    db.prepare('UPDATE administrators SET active=0,auth_version=auth_version+1 WHERE id=?').run(
      previous.id
    );
    return {
      ok: true
    };
  }
  check((method === 'POST' && !id) || (method === 'PUT' && id), 'Operação inválida.', 405);
  const username = text(data.username, 'Usuário', 60, 3).toLowerCase(),
    name = text(data.name, 'Nome', 90, 2);
  check(
    /^[a-z0-9._-]+$/.test(username),
    'Use letras sem acento, números, ponto, hífen ou sublinhado no usuário.'
  );
  check(['ROOT', 'BARBER'].includes(data.role), 'Perfil inválido.');
  check(
    !previous || previous.username !== 'root' || (username === 'root' && data.role === 'ROOT'),
    'O ROOT principal não pode ser renomeado ou rebaixado.'
  );
  check(
    !previous || previous.id !== actor.id || data.role === 'ROOT',
    'Não remova seu próprio acesso ROOT.'
  );
  const barberId = data.role === 'BARBER' ? integer(data.barberId, 'Profissional') : null;
  check(
    !barberId || db.prepare('SELECT id FROM barbers WHERE id=? AND active=1').get(barberId),
    'Profissional indisponível.'
  );
  check(
    !db
      .prepare('SELECT id FROM administrators WHERE username=? AND id<>?')
      .get(username, previous?.id || 0),
    'Usuário já cadastrado.',
    409
  );
  check(
    !barberId ||
      !db
        .prepare('SELECT id FROM administrators WHERE barber_id=? AND id<>?')
        .get(barberId, previous?.id || 0),
    'Profissional já vinculado a outra conta.',
    409
  );
  const hash = data.password ? passwordHash(data.password) : previous?.password_hash;
  check(hash, 'Informe a senha inicial.');
  if (previous)
    db.prepare(
      'UPDATE administrators SET username=?,name=?,password_hash=?,role=?,barber_id=?,active=1,auth_version=auth_version+1 WHERE id=?'
    ).run(username, name, hash, data.role, barberId, previous.id);
  else
    db.prepare(
      'INSERT INTO administrators(username,name,password_hash,role,barber_id) VALUES(?,?,?,?,?)'
    ).run(username, name, hash, data.role, barberId);
  // OTP existente é preservado, inclusive em alterações de senha feitas pelo ROOT.
  return {
    ok: true
  };
}
