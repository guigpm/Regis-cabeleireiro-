import { sessions } from './sessions.js';
import { passwordHash, passwordMatches } from './auth.js';
import { check, text } from './validation.js';
import { cpf, email, phone, customerView } from './identity.js';
export function createCustomers(db, secure = false) {
  const store = sessions('rr_customer', secure, 7 * 24 * 3600, 'Lax');
  function issue(customer, res, req) {
    store.create(res, {
      id: customer.id
    }, req);
    return {
      customer: customerView(customer)
    };
  }
  return {
    current(req, complete = false) {
      const session = store.require(req);
      const customer = db.prepare('SELECT * FROM customers WHERE id=?').get(session.id);
      check(customer, 'Entre na sua conta para continuar.', 401);
      check(!complete || customer.cpf && customer.phone, 'Complete seu cadastro com CPF e telefone antes de escolher um horário.', 403);
      return customer;
    },
    register(data, res, req) {
      const name = text(data.name, 'Nome', 90, 2),
        address = email(data.email),
        document = cpf(data.cpf),
        contact = phone(data.phone);
      const hash = passwordHash(data.password);
      check(!db.prepare('SELECT id FROM customers WHERE email=? OR cpf=?').get(address, document), 'E-mail ou CPF já cadastrado. Entre na sua conta.', 409);
      const id = db.prepare('INSERT INTO customers(name,email,cpf,phone,password_hash) VALUES(?,?,?,?,?)').run(name, address, document, contact, hash).lastInsertRowid;
      return issue(db.prepare('SELECT * FROM customers WHERE id=?').get(id), res, req);
    },
    login(data, res, req) {
      const identifier = text(data.identifier, 'E-mail ou CPF', 254).toLowerCase();
      const customer = identifier.includes('@') ? db.prepare('SELECT * FROM customers WHERE email=?').get(identifier) : db.prepare('SELECT * FROM customers WHERE cpf=?').get(identifier.replace(/\D/g, ''));
      check(passwordMatches(data.password, customer?.password_hash), 'Dados de acesso incorretos.', 401);
      return issue(customer, res, req);
    },
    complete(req, data) {
      const customer = this.current(req),
        document = cpf(data.cpf),
        contact = phone(data.phone),
        name = text(data.name, 'Nome', 90, 2);
      check(!customer.cpf || customer.cpf === document, 'O CPF do cadastro não pode ser alterado.');
      check(!db.prepare('SELECT id FROM customers WHERE cpf=? AND id<>?').get(document, customer.id), 'CPF já cadastrado. Entre na conta existente.', 409);
      db.prepare('UPDATE customers SET name=?,cpf=?,phone=? WHERE id=?').run(name, document, contact, customer.id);
      return {
        customer: customerView(db.prepare('SELECT * FROM customers WHERE id=?').get(customer.id))
      };
    },
    google(profile, res, req) {
      check(typeof profile.sub === 'string' && profile.sub.length <= 255 && profile.email_verified === true, 'O Google não confirmou este e-mail.', 401);
      let customer = db.prepare('SELECT * FROM customers WHERE google_sub=?').get(profile.sub);
      if (!customer) {
        const address = email(profile.email);
        // Não vincular automaticamente por e-mail: uma conta local exige autenticação própria.
        check(!db.prepare('SELECT id FROM customers WHERE email=?').get(address), 'Este e-mail já tem cadastro. Entre com sua senha.', 409);
        const id = db.prepare('INSERT INTO customers(name,email,google_sub) VALUES(?,?,?)').run(text(profile.name || 'Cliente Google', 'Nome', 90), address, profile.sub).lastInsertRowid;
        customer = db.prepare('SELECT * FROM customers WHERE id=?').get(id);
      }
      return issue(customer, res, req);
    },
    logout(req, res) {
      store.destroy(req, res);
    }
  };
}
