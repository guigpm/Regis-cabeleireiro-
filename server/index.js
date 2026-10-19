import { databasePath } from './config.js';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
const filename = databasePath();
let db;
try {
  db = openDatabase(filename);
} catch (error) {
  console.error(`Não foi possível abrir o banco em ${filename}.`);
  console.error(error.message);
  process.exit(1);
}
const server = createApp(db, {
  password: process.env.ADMIN_PASSWORD,
  secure: process.env.COOKIE_SECURE === 'true',
  onInitialPassword: (password) => console.log(`Senha inicial do painel (guarde-a): ${password}`)
});
const host = process.env.HOST || '127.0.0.1',
  port = Number(process.env.PORT || 3000);
server.listen(port, host, () => {
  console.log(
    `Clientes: http://${host}:${port}/\nPainel: http://${host}:${port}/painel\nBanco: ${filename}`
  );
});
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
