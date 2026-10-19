import {
  history,
  report,
  transition,
  appointmentProducts,
  attachedProducts,
  setStock,
  sell,
  commission
} from '../models/operations.js';
import { personalHours } from '../models/schedule.js';

/** Thin HTTP adapter: input parsing only; ownership, state transitions and money live in models. */
export async function operationsController(db, actor, req, res, url, { respond, body }) {
  const path = url.pathname,
    method = req.method,
    query = Object.fromEntries(url.searchParams);
  if (path === '/api/admin/history' && method === 'GET') return respond(history(db, actor, query));
  if (path === '/api/admin/reports' && method === 'GET') return respond(report(db, actor, query));
  if (path === '/api/admin/sales' && method === 'POST')
    return respond(sell(db, actor, await body(req)), 201);
  const hours = /^\/api\/admin\/barbers\/(\d+)\/hours$/.exec(path);
  if (hours)
    return respond(
      personalHours(db, actor, hours[1], method, method === 'GET' ? {} : await body(req))
    );
  const rate = /^\/api\/admin\/barbers\/(\d+)\/commission$/.exec(path);
  if (rate && method === 'PUT') return respond(commission(db, actor, rate[1], await body(req)));
  const appointment = /^\/api\/admin\/appointments\/([a-f0-9-]+)\/(status|products)$/.exec(path);
  if (appointment) {
    if (appointment[2] === 'status' && method === 'PATCH')
      return respond(transition(db, actor, appointment[1], await body(req)));
    if (appointment[2] === 'products') {
      if (method === 'GET') return respond(attachedProducts(db, actor, appointment[1]));
      if (method === 'PUT')
        return respond(appointmentProducts(db, actor, appointment[1], await body(req)));
    }
  }
  const stock = /^\/api\/admin\/products\/(\d+)\/stock$/.exec(path);
  if (stock && method === 'PUT') return respond(setStock(db, actor, stock[1], await body(req)));
  return false;
}
