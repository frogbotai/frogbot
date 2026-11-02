import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** The build folders that take turns: a build never writes the one being served (420 D5). */
export const SLOTS = ['a', 'b'] as const;

export type Slot = (typeof SLOTS)[number];

/** `<state>/frogbot/services`, `<state>` being `$XDG_STATE_HOME` or `~/.local/state`. */
export function servicesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'frogbot', 'services');
}

/** The app folder's real path, so a symlinked path names the same app. */
export function appDir(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

/** The first 12 hex characters of the SHA-256 of the app's real path. */
export function serviceId(dir: string): string {
  return createHash('sha256').update(appDir(dir)).digest('hex').slice(0, 12);
}

export function registrationFile(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(servicesDir(env), `${id}.json`);
}

/** What the service keeps in the app's gitignored `.frogbot/`. */
export function appPaths(dir: string) {
  const root = join(dir, '.frogbot');

  return {
    root,
    builds: join(root, 'builds'),
    build: (slot: Slot) => join(root, 'builds', slot),
    distDir: (slot: Slot) => `.frogbot/builds/${slot}`,
    log: join(root, 'service.log'),
    launchdLog: join(root, 'launchd.log'),
    port: join(root, 'port'),
  };
}
