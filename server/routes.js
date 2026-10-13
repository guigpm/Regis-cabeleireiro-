import { createAuth, adminView } from './auth.js';
import { createCustomers } from './customers.js';
import { googleLogin } from './google.js';
import { customerView } from './identity.js';
import { availability, createAppointment } from './booking.js';
import { nowOptions, requestNow, decideNow, expireWalkins } from './walkins.js';
import { catalogMutation, updateHours, addBlock } from './admin.js';
import { adminAccounts, ownBarber, root, serviceSelection } from './permissions.js';
import { check, date, integer } from './validation.js';
export function createRoutes(db, options, {
  send,
  body,
  limit
}) {
  const auth = createAuth(db, options),
    customers = createCustomers(db, options.secure);
  const google = googleLogin(customers, {
    ...options.google,
    secure: options.secure
  });
  function catalog() {
    return {
      services: db.prepare('SELECT id,name,price,duration FROM services WHERE active=1').all(),
      barbers: db.prepare('SELECT id,name,spec,photo,all_services AS allServices FROM barbers WHERE active=1').all().map(b => ({
        ...b,
        allServices: Boolean(b.allServices),
        serviceIds: db.prepare('SELECT service_id FROM barber_services WHERE barber_id=?').all(b.id).map(s => s.service_id)
      })),
      products: db.prepare('SELECT id,name,price,category,image FROM products WHERE active=1').all(),
      hours: db.prepare('SELECT * FROM hours ORDER BY weekday').all(),
      whatsapp: db.prepare("SELECT value FROM settings WHERE key='whatsapp'").get().value
    };
  }
  return async (req, res, url) => {
    const path = url.pathname,
      method = req.method;
    const respond = (data, status = 200) => {
      send(res, status, data);
      return true;
    };
    if (path === '/api/catalog' && method === 'GET') return respond(catalog());
    if (path === '/api/customer/config' && method === 'GET') return respond({
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
          Location: '/?authError=' + encodeURIComponent(error.status ? error.message : 'Não foi possível entrar pelo Google. Tente novamente.') + '#conta'
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
    if (path === '/api/customer/session' && method === 'GET') return respond({
      customer: customerView(customers.current(req))
    });
    if (path === '/api/customer/profile' && method === 'PUT') return respond(customers.complete(req, await body(req)));
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
    if (path === '/api/customer/appointments' && method === 'GET') {
      const customer = customers.current(req);
      expireWalkins(db);
      return respond({
        appointments: db.prepare('SELECT id,date,start,end,service,barber,price,payment,status FROM appointments WHERE customer_id=? ORDER BY date DESC,start DESC LIMIT 100').all(customer.id),
        walkins: db.prepare('SELECT w.id,w.status,w.expires_at,w.appointment_id,b.name AS barber,s.name AS service FROM walkins w JOIN barbers b ON b.id=w.barber_id JOIN services s ON s.id=w.service_id WHERE w.customer_id=? ORDER BY w.created_at DESC LIMIT 20').all(customer.id)
      });
    }
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
    if (path === '/api/admin/session' && method === 'GET') return respond({
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
      return respond(adminAccounts(db, admin, method, accounts[1], ['POST', 'PUT'].includes(method) ? await body(req) : {}));
    }
    if (path === '/api/admin/catalog' && method === 'GET') return respond(catalog());
    const selection = /^\/api\/admin\/barbers\/(\d+)\/services$/.exec(path);
    if (selection && method === 'PUT') return respond(serviceSelection(db, admin, selection[1], await body(req)));
    if (path === '/api/admin/appointments' && method === 'GET') {
      const day = date(url.searchParams.get('date'));
      return respond(db.prepare('SELECT * FROM appointments WHERE date=? AND (? IS NULL OR barber_id=?) ORDER BY start,barber').all(day, admin.barber_id, admin.barber_id));
    }
    const appointment = /^\/api\/admin\/appointments\/([a-f0-9-]+)$/.exec(path);
    if (appointment && method === 'DELETE') {
      const item = db.prepare('SELECT barber_id FROM appointments WHERE id=?').get(appointment[1]);
      check(item, 'Agendamento inexistente.', 404);
      ownBarber(admin, item.barber_id);
      check(db.prepare("UPDATE appointments SET status='cancelled' WHERE id=? AND status='confirmed'").run(appointment[1]).changes, 'Agendamento já cancelado.', 409);
      return respond({
        ok: true
      });
    }
    if (path === '/api/admin/hours' && method === 'PUT') {
      root(admin);
      return respond(updateHours(db, (await body(req)).hours));
    }
    if (path === '/api/admin/blocks' && method === 'GET') return respond(db.prepare('SELECT blocks.*,barbers.name AS barber FROM blocks JOIN barbers ON barbers.id=blocks.barber_id WHERE date=? AND (? IS NULL OR barber_id=?) ORDER BY start').all(date(url.searchParams.get('date')), admin.barber_id, admin.barber_id));
    if (path === '/api/admin/blocks' && method === 'POST') {
      const data = await body(req);
      ownBarber(admin, data.barberId);
      return respond(addBlock(db, data), 201);
    }
    const block = /^\/api\/admin\/blocks\/(\d+)$/.exec(path);
    if (block && method === 'DELETE') {
      const item = db.prepare('SELECT barber_id FROM blocks WHERE id=?').get(integer(block[1], 'ID'));
      check(item, 'Bloqueio inexistente.', 404);
      ownBarber(admin, item.barber_id);
      db.prepare('DELETE FROM blocks WHERE id=?').run(Number(block[1]));
      return respond({
        ok: true
      });
    }
    if (path === '/api/admin/walkins' && method === 'GET') {
      expireWalkins(db);
      return respond(db.prepare("SELECT w.id,w.barber_id,w.expires_at,c.name AS customer,c.phone,b.name AS barber,s.name AS service FROM walkins w JOIN customers c ON c.id=w.customer_id JOIN barbers b ON b.id=w.barber_id JOIN services s ON s.id=w.service_id WHERE w.status='pending' AND (? IS NULL OR w.barber_id=?) ORDER BY w.created_at").all(admin.barber_id, admin.barber_id));
    }
    const walkin = /^\/api\/admin\/walkins\/([a-f0-9-]+)$/.exec(path);
    if (walkin && method === 'POST') return respond(decideNow(db, admin, walkin[1], (await body(req)).decision));
    const entity = /^\/api\/admin\/(services|barbers|products)(?:\/(\d+))?$/.exec(path);
    if (entity) {
      root(admin);
      return respond(catalogMutation(db, entity[1], entity[2], method, method === 'DELETE' ? {} : await body(req)), method === 'POST' ? 201 : 200);
    }
    return false;
  };
}
