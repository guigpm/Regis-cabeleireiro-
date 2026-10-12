import { createInterface } from 'node:readline/promises';
import { openDatabase } from './database.js';
import { setPassword } from './auth.js';
import { databasePath } from './config.js';
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout
});
let db;
try {
  const password = await terminal.question('Nova senha do painel (12–200 caracteres; entrada visível neste terminal): ');
  const confirmation = await terminal.question('Repita a senha: ');
  if (password !== confirmation) throw new Error('As senhas não coincidem.');
  db = openDatabase(databasePath());
  setPassword(db, password);
  console.log('Senha atualizada. Reinicie o servidor para encerrar as sessões existentes.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  terminal.close();
  db?.close();
}
