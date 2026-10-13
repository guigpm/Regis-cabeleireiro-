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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
