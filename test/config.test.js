import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { databasePath } from '../server/config.js';
import { openDatabase } from '../server/database.js';
test('banco padrão fica na pasta pessoal, fora do checkout', () => {
  assert.equal(
    databasePath({}, '/home/exemplo'),
    '/home/exemplo/.local/share/rr-barbearia/barbearia.sqlite'
  );
});
test('DB_PATH explícito tem prioridade; XDG exige caminho absoluto', () => {
  assert.equal(
    databasePath({
      DB_PATH: ' ./custom.sqlite ',
      XDG_DATA_HOME: '/local/data'
    }),
    resolve('custom.sqlite')
  );
  assert.equal(
    databasePath({
      XDG_DATA_HOME: '/local/data'
    }),
    '/local/data/rr-barbearia/barbearia.sqlite'
  );
  assert.equal(
    databasePath(
      {
        DB_PATH: '',
        XDG_DATA_HOME: 'relative'
      },
      '/home/exemplo'
    ),
    '/home/exemplo/.local/share/rr-barbearia/barbearia.sqlite'
  );
});
test('inicialização cria a pasta de dados e reabre o mesmo banco local', () => {
  const home = mkdtempSync(join(tmpdir(), 'rr-home-'));
  let db;
  try {
    const filename = databasePath({}, home);
    db = openDatabase(filename);
    assert.ok(existsSync(filename));
    db.prepare("INSERT INTO settings VALUES ('path_test', 'preservado')").run();
    db.close();
    db = openDatabase(databasePath({}, home));
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='path_test'").get().value,
      'preservado'
    );
  } finally {
    db?.close();
    rmSync(home, {
      recursive: true,
      force: true
    });
  }
});
