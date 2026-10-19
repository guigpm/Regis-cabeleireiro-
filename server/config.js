import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

// O banco não deve acompanhar o checkout: o projeto pode estar em um NAS.
// Compartilhado pelo servidor e pelo comando de troca de senha.
export function databasePath(env = process.env, home = homedir()) {
  if (env.DB_PATH?.trim()) return resolve(env.DB_PATH.trim());
  const dataHome =
    env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME)
      ? env.XDG_DATA_HOME
      : join(home, '.local', 'share');
  return join(dataHome, 'rr-barbearia', 'barbearia.sqlite');
}
