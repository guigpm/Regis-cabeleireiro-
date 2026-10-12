import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { availability, createAppointment } from './booking.js';
import { catalogMutation, updateHours, addBlock } from './admin.js';
import { check, HttpError, date, integer } from './validation.js';
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};
function send(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  check(req.headers['content-type']?.split(';')[0] === 'application/json', 'Envie JSON.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    check(size <= 1400000, 'Arquivo muito grande.', 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    check(data && typeof data === 'object' && !Array.isArray(data), 'JSON inválido.');
    return data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'JSON inválido.');
  }
}
export function createApp(db, options = {}) {
  const auth = createAuth(db, options),
    limits = new Map();
  function limit(req, action, max, windowMs) {
    const now = Date.now();
    for (const [key, item] of limits) if (item.until < now) limits.delete(key);
    const key = `${action}:${req.socket.remoteAddress}`,
      entry = limits.get(key) || {
        count: 0,
        until: now + windowMs
      };
    entry.count++;
    limits.set(key, entry);
    check(entry.count <= max, 'Muitas tentativas. Aguarde alguns minutos.', 429);
  }
  function catalog() {
    return {
      services: db.prepare('SELECT id,name,price,duration FROM services WHERE active=1').all(),
      barbers: db.prepare('SELECT id,name,spec,photo FROM barbers WHERE active=1').all(),
      products: db.prepare('SELECT id,name,price,category,image FROM products WHERE active=1').all(),
      hours: db.prepare('SELECT * FROM hours ORDER BY weekday').all(),
      whatsapp: db.prepare("SELECT value FROM settings WHERE key='whatsapp'").get().value
    };
  }
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost'),
        path = url.pathname,
        method = req.method;
      if (path.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) {
          check(req.headers['sec-fetch-site'] !== 'cross-site', 'Origem não permitida.', 403);
          if (req.headers.origin) {
            let origin;
            try {
              origin = new URL(req.headers.origin);
            } catch {
              throw new HttpError(403, 'Origem não permitida.');
            }
            check(origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol), 'Origem não permitida.', 403);
          }
        }
        if (path === '/api/catalog' && method === 'GET') return send(res, 200, catalog());
        if (path === '/api/availability' && method === 'GET') {
          const result = availability(db, Object.fromEntries(url.searchParams));
          return send(res, 200, {
            date: result.date,
            slots: result.slots
          });
        }
        if (path === '/api/appointments' && method === 'POST') {
          limit(req, 'book', 30, 15 * 60 * 1000);
          return send(res, 201, createAppointment(db, await body(req)));
        }
        if (path === '/api/admin/login' && method === 'POST') {
          limit(req, 'login', 10, 15 * 60 * 1000);
          auth.login((await body(req)).password, res);
          return send(res, 200, {
            ok: true
          });
        }
        if (path.startsWith('/api/admin/')) {
          auth.require(req);
          if (path === '/api/admin/session' && method === 'GET') return send(res, 200, {
            ok: true
          });
          if (path === '/api/admin/logout' && method === 'POST') {
            auth.logout(req, res);
            return send(res, 200, {
              ok: true
            });
          }
          if (path === '/api/admin/catalog' && method === 'GET') return send(res, 200, catalog());
          if (path === '/api/admin/appointments' && method === 'GET') {
            const day = date(url.searchParams.get('date'));
            return send(res, 200, db.prepare('SELECT * FROM appointments WHERE date=? ORDER BY start,barber').all(day));
          }
          const appointment = /^\/api\/admin\/appointments\/([a-f0-9-]+)$/.exec(path);
          if (appointment && method === 'DELETE') {
            const result = db.prepare("UPDATE appointments SET status='cancelled' WHERE id=? AND status='confirmed'").run(appointment[1]);
            check(result.changes, 'Agendamento não encontrado ou já cancelado.', 404);
            return send(res, 200, {
              ok: true
            });
          }
          if (path === '/api/admin/hours' && method === 'PUT') return send(res, 200, updateHours(db, (await body(req)).hours));
          if (path === '/api/admin/blocks' && method === 'GET') return send(res, 200, db.prepare('SELECT blocks.*,barbers.name AS barber FROM blocks JOIN barbers ON barbers.id=blocks.barber_id WHERE date=? ORDER BY start').all(date(url.searchParams.get('date'))));
          if (path === '/api/admin/blocks' && method === 'POST') return send(res, 201, addBlock(db, await body(req)));
          const block = /^\/api\/admin\/blocks\/(\d+)$/.exec(path);
          if (block && method === 'DELETE') {
            check(db.prepare('DELETE FROM blocks WHERE id=?').run(integer(block[1], 'ID')).changes, 'Bloqueio inexistente.', 404);
            return send(res, 200, {
              ok: true
            });
          }
          const entity = /^\/api\/admin\/(services|barbers|products)(?:\/(\d+))?$/.exec(path);
          if (entity) return send(res, method === 'POST' ? 201 : 200, catalogMutation(db, entity[1], entity[2], method, method === 'DELETE' ? {} : await body(req)));
        }
        throw new HttpError(404, 'Recurso não encontrado.');
      }
      check(method === 'GET' || method === 'HEAD', 'Método não permitido.', 405);
      let relative;
      if (path === '/' || path === '/index.html') relative = 'index.html';else if (path === '/painel' || path === '/painel/') {
        relative = 'admin.html';
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      } else if (path.startsWith('/assets/')) relative = decodeURIComponent(path.slice(1));else throw new HttpError(404, 'Página não encontrada.');
      const filename = resolve(publicRoot, relative);
      check(filename.startsWith(publicRoot.endsWith(sep) ? publicRoot : publicRoot + sep), 'Página não encontrada.', 404);
      let content;
      try {
        content = await readFile(filename);
      } catch {
        throw new HttpError(404, 'Arquivo não encontrado.');
      }
      res.writeHead(200, {
        'Content-Type': mime[extname(filename)] || 'application/octet-stream'
      });
      res.end(method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send(res, error.status || 500, {
        error: error.status ? error.message : 'Não foi possível concluir a operação.'
      });else res.end();
    }
  });
}
