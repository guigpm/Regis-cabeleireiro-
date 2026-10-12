import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), {
    recursive: true
  });
  const db = new DatabaseSync(filename);
  try {
    db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL CHECK(price>0),
      duration INTEGER NOT NULL CHECK(duration>0), active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, spec TEXT NOT NULL,
      photo TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL NOT NULL CHECK(price>0),
      category TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS hours (
      weekday INTEGER PRIMARY KEY CHECK(weekday BETWEEN 0 AND 6),
      opens INTEGER NOT NULL, closes INTEGER NOT NULL, closed INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, barber_id INTEGER NOT NULL REFERENCES barbers(id),
      service_id INTEGER NOT NULL REFERENCES services(id), date TEXT NOT NULL,
      start INTEGER NOT NULL, end INTEGER NOT NULL, customer TEXT NOT NULL, phone TEXT NOT NULL,
      payment TEXT NOT NULL, service TEXT NOT NULL, barber TEXT NOT NULL, price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS appointment_slots ON appointments(barber_id,date,status,start,end);
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY, barber_id INTEGER NOT NULL REFERENCES barbers(id),
      date TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL, reason TEXT NOT NULL
    );
  `);
    if (!db.prepare("SELECT 1 FROM settings WHERE key='seeded'").get()) {
      const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url)));
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const s of seed.services) db.prepare('INSERT INTO services(id,name,price,duration) VALUES(?,?,?,?)').run(s.id, s.name, s.price, s.duration);
        for (const b of seed.barbers) db.prepare('INSERT INTO barbers(id,name,spec,photo) VALUES(?,?,?,?)').run(b.id, b.name, b.spec, b.photo);
        for (const p of seed.products) db.prepare('INSERT INTO products(id,name,price,category,image) VALUES(?,?,?,?,?)').run(p.id, p.name, p.price, p.category, p.image);
        for (let day = 0; day < 7; day++) db.prepare('INSERT INTO hours VALUES(?,?,?,?)').run(day, 540, day === 6 ? 1080 : 1200, day === 0 ? 1 : 0);
        db.prepare('INSERT INTO settings VALUES(?,?)').run('whatsapp', seed.whatsapp);
        db.prepare('INSERT INTO settings VALUES(?,?)').run('seeded', '1');
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    return db;
  } catch (error) {
    db.close();
    if (error.errcode === 5 || error.errcode === 6) {
      throw new Error('O SQLite está bloqueado. Verifique se outro processo mantém uma transação aberta. Se DB_PATH aponta para NAS/SMB/NFS, configure um arquivo em disco local; sem DB_PATH, o padrão é a pasta de dados do usuário.', {
        cause: error
      });
    }
    throw error;
  }
}
