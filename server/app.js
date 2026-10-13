import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoutes } from './routes.js';
import { check, HttpError } from './validation.js';
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
  const limits = new Map();
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
  const routes = createRoutes(db, options, {
    send,
    body,
    limit
  });
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
        if (await routes(req, res, url)) return;
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
