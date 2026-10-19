import { customerAgenda, dailyAgenda, dailyBlocks, pendingWalkins } from '../models/agenda.js';
import { readCatalog } from '../models/catalog.js';
import { operationsController } from './operations-controller.js';
import { customerCancel, transition } from '../models/operations.js';
import { blockSchedule, changeBlock } from '../models/schedule.js';
import { createAuth, adminView } from '../auth.js';
import { createCustomers } from '../customers.js';
import { googleLogin } from '../google.js';
import { customerView } from '../identity.js';
import { availability, createAppointment } from '../booking.js';
import { nowOptions, requestNow, decideNow } from '../walkins.js';
import { catalogMutation, updateHours } from '../admin.js';
import { adminAccounts, ownBarber, root, serviceSelection } from '../permissions.js';
export function createRoutes(db, options, { send, body, limit }) {
  const auth = createAuth(db, options),
    customers = createCustomers(db, options.secure);
  const google = googleLogin(customers, {
    ...options.google,
    secure: options.secure
  });
  const catalog = () => readCatalog(db);
  return async (req, res, url) => {
    const path = url.pathname,
      method = req.method;
    const respond = (data, status = 200) => {
      send(res, status, data);
      return true;
    };
    if (path === '/api/catalog' && method === 'GET') return respond(catalog());
    if (path === '/api/customer/config' && method === 'GET')
      return respond({
        googleEnabled: google.enabled
      });
    if (path === '/api/customer/google/start' && method === 'GET') {
      limit(req, 'google', 20, 600000);
      google.start(req, res);
      return true;
    }
    if (path === '/api/customer/google/callback' && method === 'GET') {
      try {
        await google.callback(req, res, url.searchParams);
      } catch (error) {
        res.writeHead(302, {
          Location:
            '/?authError=' +
            encodeURIComponent(
              error.status ? error.message : 'Não foi possível entrar pelo Google. Tente novamente.'
            ) +
            '#conta'
        });
        res.end();
      }
      return true;
    }
    if (path === '/api/customer/register' && method === 'POST') {
      limit(req, 'register', 10, 15 * 60000);
      return respond(customers.register(await body(req), res, req), 201);
    }
    if (path === '/api/customer/login' && method === 'POST') {
      limit(req, 'customer-login', 15, 15 * 60000);
      return respond(customers.login(await body(req), res, req));
    }
    if (path === '/api/customer/session' && method === 'GET')
      return respond({
        customer: customerView(customers.current(req))
      });
    if (path === '/api/customer/profile' && method === 'PUT')
      return respond(customers.complete(req, await body(req)));
    if (path === '/api/customer/logout' && method === 'POST') {
      customers.logout(req, res);
      return respond({
        ok: true
      });
    }
    if (path === '/api/availability' && method === 'GET') {
      customers.current(req, true);
      const result = availability(db, Object.fromEntries(url.searchParams));
      return respond({
        date: result.date,
        slots: result.slots,
        timeline: result.timeline,
        occupied: result.occupied
      });
    }
    if (path === '/api/appointments' && method === 'POST') {
      const customer = customers.current(req, true);
      limit(req, 'book', 30, 15 * 60000);
      return respond(createAppointment(db, await body(req), customer), 201);
    }
    const cancel = /^\/api\/customer\/appointments\/([a-f0-9-]+)$/.exec(path);
    if (cancel && method === 'DELETE')
      return respond(customerCancel(db, customers.current(req), cancel[1]));
    if (path === '/api/customer/appointments' && method === 'GET')
      return respond(customerAgenda(db, customers.current(req)));
    if (path === '/api/now' && method === 'GET') {
      customers.current(req, true);
      return respond(nowOptions(db));
    }
    if (path === '/api/now' && method === 'POST') {
      const customer = customers.current(req, true);
      limit(req, 'now', 15, 15 * 60000);
      return respond(requestNow(db, await body(req), customer), 201);
    }
    if (path === '/api/admin/login' && method === 'POST') {
      limit(req, 'admin-login', 10, 15 * 60000);
      return respond(auth.login(await body(req), res, req));
    }
    if (path === '/api/admin/login/otp' && method === 'POST') {
      limit(req, 'otp-login', 20, 15 * 60000);
      return respond(auth.verify(await body(req), res, req));
    }
    if (!path.startsWith('/api/admin/')) return false;
    const admin = auth.require(req);
    if (await operationsController(db, admin, req, res, url, { respond, body })) return true;
    if (path === '/api/admin/session' && method === 'GET')
      return respond({
        admin: adminView(admin)
      });
    if (path === '/api/admin/logout' && method === 'POST') {
      auth.logout(req, res);
      return respond({
        ok: true
      });
    }
    if (path.startsWith('/api/admin/otp/') && method === 'POST') {
      limit(req, 'otp-manage', 15, 15 * 60000);
      const data = await body(req);
      if (path.endsWith('/setup')) return respond(auth.setup(admin, data.password));
      if (path.endsWith('/enable')) return respond(auth.enable(admin, data.code, req, res));
      if (path.endsWith('/disable')) return respond(auth.disable(admin, data, req, res));
    }
    const accounts = /^\/api\/admin\/accounts(?:\/(\d+))?$/.exec(path);
    if (accounts) {
      root(admin);
      return respond(
        adminAccounts(
          db,
          admin,
          method,
          accounts[1],
          ['POST', 'PUT'].includes(method) ? await body(req) : {}
        )
      );
    }
    if (path === '/api/admin/catalog' && method === 'GET') return respond(readCatalog(db, admin));
    const selection = /^\/api\/admin\/barbers\/(\d+)\/services$/.exec(path);
    if (selection && method === 'PUT')
      return respond(serviceSelection(db, admin, selection[1], await body(req)));
    if (path === '/api/admin/appointments' && method === 'GET')
      return respond(dailyAgenda(db, admin, url.searchParams.get('date')));
    const appointment = /^\/api\/admin\/appointments\/([a-f0-9-]+)$/.exec(path);
    if (appointment && method === 'DELETE') {
      return respond(transition(db, admin, appointment[1], { status: 'cancelled' }));
    }
    if (path === '/api/admin/hours' && method === 'PUT') {
      root(admin);
      return respond(updateHours(db, (await body(req)).hours));
    }
    if (path === '/api/admin/blocks' && method === 'GET')
      return respond(dailyBlocks(db, admin, url.searchParams.get('date')));
    if (path === '/api/admin/blocks' && method === 'POST') {
      const data = await body(req);
      ownBarber(admin, data.barberId);
      return respond(blockSchedule(db, admin, data), 201);
    }
    const block = /^\/api\/admin\/blocks\/(\d+)$/.exec(path);
    if (block && ['DELETE', 'PATCH'].includes(method))
      return respond(
        changeBlock(db, admin, block[1], method, method === 'PATCH' ? await body(req) : {})
      );
    if (path === '/api/admin/walkins' && method === 'GET')
      return respond(pendingWalkins(db, admin));
    const walkin = /^\/api\/admin\/walkins\/([a-f0-9-]+)$/.exec(path);
    if (walkin && method === 'POST')
      return respond(decideNow(db, admin, walkin[1], (await body(req)).decision));
    const entity = /^\/api\/admin\/(services|barbers|products)(?:\/(\d+))?$/.exec(path);
    if (entity) {
      root(admin);
      return respond(
        catalogMutation(
          db,
          entity[1],
          entity[2],
          method,
          method === 'DELETE' ? {} : await body(req)
        ),
        method === 'POST' ? 201 : 200
      );
    }
    return false;
  };
}
