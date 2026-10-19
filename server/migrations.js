// Incremental e transacional: preserva cadastros e reservas de versões anteriores.
export function migrate(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        cpf TEXT UNIQUE, phone TEXT NOT NULL DEFAULT '', password_hash TEXT,
        google_sub TEXT UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS administrators (
        id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL, password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('ROOT','BARBER')),
        barber_id INTEGER UNIQUE REFERENCES barbers(id), active INTEGER NOT NULL DEFAULT 1,
        otp_secret TEXT, otp_last_counter INTEGER NOT NULL DEFAULT -1,
        recovery_hashes TEXT NOT NULL DEFAULT '[]', auth_version INTEGER NOT NULL DEFAULT 1,
        CHECK((role='ROOT' AND barber_id IS NULL) OR (role='BARBER' AND barber_id IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS barber_services (
        barber_id INTEGER NOT NULL REFERENCES barbers(id), service_id INTEGER NOT NULL REFERENCES services(id),
        PRIMARY KEY(barber_id,service_id)
      );
      CREATE TABLE IF NOT EXISTS walkins (
        id TEXT PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
        barber_id INTEGER NOT NULL REFERENCES barbers(id), service_id INTEGER NOT NULL REFERENCES services(id),
        date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, payment TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','expired','cancelled')),
        expires_at INTEGER NOT NULL, appointment_id TEXT REFERENCES appointments(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS walkin_slots ON walkins(barber_id,date,status,expires_at);`);
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=1').get()) {
      db.exec(`ALTER TABLE barbers ADD COLUMN all_services INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE appointments ADD COLUMN customer_id INTEGER REFERENCES customers(id);
        CREATE INDEX appointment_customer ON appointments(customer_id,date);
        INSERT INTO schema_migrations VALUES(1);`);
    }
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) {
      db.exec(`
        ALTER TABLE barbers ADD COLUMN commission_bps INTEGER NOT NULL DEFAULT 4500 CHECK(commission_bps BETWEEN 0 AND 10000);
        ALTER TABLE appointments ADD COLUMN work_status TEXT NOT NULL DEFAULT 'scheduled' CHECK(work_status IN ('scheduled','in_progress','completed'));
        ALTER TABLE appointments ADD COLUMN started_at TEXT;
        ALTER TABLE appointments ADD COLUMN completed_at TEXT;
        ALTER TABLE appointments ADD COLUMN card_brand TEXT NOT NULL DEFAULT '';
        ALTER TABLE blocks ADD COLUMN source_role TEXT NOT NULL DEFAULT 'ROOT' CHECK(source_role IN ('ROOT','BARBER'));
        ALTER TABLE blocks ADD COLUMN created_by INTEGER REFERENCES administrators(id);
        ALTER TABLE products ADD COLUMN stock INTEGER CHECK(stock IS NULL OR stock>=0);
        CREATE TABLE barber_hours(barber_id INTEGER REFERENCES barbers(id),weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),opens INTEGER NOT NULL,closes INTEGER NOT NULL,closed INTEGER NOT NULL,PRIMARY KEY(barber_id,weekday));
        CREATE TABLE barber_days(barber_id INTEGER REFERENCES barbers(id),date TEXT,opens INTEGER NOT NULL,closes INTEGER NOT NULL,closed INTEGER NOT NULL,PRIMARY KEY(barber_id,date));
        CREATE TABLE appointment_products(appointment_id TEXT REFERENCES appointments(id),product_id INTEGER REFERENCES products(id),name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),unit_cents INTEGER NOT NULL CHECK(unit_cents>0),PRIMARY KEY(appointment_id,product_id));
        CREATE TABLE sales(id TEXT PRIMARY KEY,barber_id INTEGER NOT NULL REFERENCES barbers(id),actor_id INTEGER NOT NULL REFERENCES administrators(id),request_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE ledger(id INTEGER PRIMARY KEY,barber_id INTEGER NOT NULL REFERENCES barbers(id),appointment_id TEXT REFERENCES appointments(id),sale_id TEXT REFERENCES sales(id),kind TEXT NOT NULL CHECK(kind IN ('service','product')),item_id INTEGER NOT NULL,name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),unit_cents INTEGER NOT NULL,gross_cents INTEGER NOT NULL,commission_bps INTEGER NOT NULL,commission_cents INTEGER NOT NULL,payment TEXT NOT NULL,card_brand TEXT NOT NULL,date TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES administrators(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK((appointment_id IS NOT NULL AND sale_id IS NULL) OR (appointment_id IS NULL AND sale_id IS NOT NULL)));
        CREATE UNIQUE INDEX ledger_appointment_line ON ledger(appointment_id,kind,item_id) WHERE appointment_id IS NOT NULL;
        CREATE INDEX ledger_period ON ledger(date,barber_id,kind);
        CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES administrators(id),action TEXT NOT NULL,target TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        INSERT INTO schema_migrations VALUES(2);
      `);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
