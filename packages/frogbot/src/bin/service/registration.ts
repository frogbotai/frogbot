import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { servicesDir } from './paths.js';

export type ServiceState =
  'starting' | 'running' | 'building' | 'update failed' | 'crashed' | 'stopped';

/** One running app, at `<state>/frogbot/services/<id>.json`. No secrets. */
export type Registration = {
  id: string;
  dir: string;
  url: string;
  port: number;
  /** The supervisor's. */
  pid: number;
  /** The server answering behind the proxy, when one is up. */
  serverPid?: number;
  /** FrogBot's version. */
  frogbot: string;
  startedAt: string;
  state: ServiceState;
  /** The build folder being served. */
  build?: string;
  lastError?: string;
  log: string;
  autostart: boolean;
};

export type Owner = Pick<Registration, 'id' | 'pid'>;

export function readRegistration(file: string): Registration | undefined {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Registration;

    return typeof value?.id === 'string' && typeof value.pid === 'number' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function listRegistrations(env: NodeJS.ProcessEnv = process.env): Registration[] {
  const dir = servicesDir(env);
  let names: string[];

  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  return names
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => readRegistration(join(dir, name)) ?? [])
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/** Writes a temp file, then renames it over `file`, so a reader never sees half of one. */
export function writeRegistration(file: string, registration: Registration): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });

  const temp = `${file}.${registration.pid}.tmp`;

  writeFileSync(temp, `${JSON.stringify(registration, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

export const owns = (found: Registration | undefined, owner: Owner): found is Registration =>
  found?.id === owner.id && found.pid === owner.pid;

/** Removes `file` only while it still names `owner`, so a newer supervisor's stays. */
export function removeRegistration(file: string, owner: Owner): boolean {
  if (!owns(readRegistration(file), owner)) return false;

  rmSync(file, { force: true });

  return true;
}

/**
 * Re-reads `file` every `interval` ms and calls `onLost` once when it is gone or names another
 * `id` or `pid`: `frogbot down` deleted it, or another supervisor took the app over.
 */
export function watchOwnership({
  file,
  owner,
  onLost,
  interval = 5000,
}: {
  file: string;
  owner: Owner;
  onLost: () => void;
  interval?: number;
}): () => void {
  const timer = setInterval(() => {
    if (owns(readRegistration(file), owner)) return;

    clearInterval(timer);
    onLost();
  }, interval);

  timer.unref();

  return () => clearInterval(timer);
}

export function isAlive(pid: number | undefined): boolean {
  if (!pid) return false;

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
