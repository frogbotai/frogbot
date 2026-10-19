import nextEnvImport from '@next/env';

const { loadEnvConfig } = nextEnvImport;

const providedByDojo = new Set(['DATABASE_URL', 'FROGBOT_SECRET', 'NODE_ENV', 'PORT', 'HOSTNAME']);

const silentLog = { info: () => {}, error: () => {} };

/** A key `frogbot share` can carry to Dojo. */
export type EnvKey = {
  name: string;
  value: string;
};

/** The variables in the app's `.env` files, as `frogbot dev` loads them: the first file to set one wins. */
export function readEnvFiles(root: string): Record<string, string> {
  const { loadedEnvFiles } = loadEnvConfig(root, true, silentLog, true);
  const env: Record<string, string> = {};

  for (const file of loadedEnvFiles) {
    for (const [name, value] of Object.entries(file.env)) {
      if (!(name in env) && value !== undefined) env[name] = value;
    }
  }

  return env;
}

/** The keys to carry: non-empty `.env` values, minus the ones Dojo provides. */
export function envKeys(env: Record<string, string>): EnvKey[] {
  return Object.entries(env)
    .filter(([name, value]) => value !== '' && !providedByDojo.has(name))
    .map(([name, value]) => ({ name, value }));
}

/** `••••` plus the last 4 characters, or `••••` alone when the value is under 12 characters. */
export function mask(value: string): string {
  return value.length < 12 ? '••••' : `••••${value.slice(-4)}`;
}
