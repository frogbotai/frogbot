import { usageError } from './json.js';
import { isAlive, listRegistrations, type Registration } from './service/registration.js';
import { leftServer } from './service/stop.js';

function uptime(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }

  return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
}

function stoppedState(registration: Registration): string {
  const left = leftServer(registration.serverPid, registration.dir);

  return left ? `stopped (server left running, pid ${left})` : 'stopped';
}

/** One row per registered app; one whose supervisor is gone is `stopped`. */
export function statusRows(registrations: Registration[], now = Date.now()): string[][] {
  return registrations.map((registration) => {
    const alive = isAlive(registration.pid);

    return [
      registration.dir,
      registration.url,
      registration.mode ?? 'production',
      alive ? registration.state : stoppedState(registration),
      alive ? uptime(registration.startedAt, now) : '-',
      (registration.lastError ?? '')
        .split('\n')
        .filter((line) => line.trim())
        .at(-1) ?? '',
    ];
  });
}

/** One line per app that is up on a `next` with npm security advisories, naming the fix. */
export function advisoryLines(registrations: Registration[]): string[] {
  return registrations
    .filter((registration) => registration.advisory && isAlive(registration.pid))
    .map((registration) => `[frogbot] ${registration.dir}: ${registration.advisory}`);
}

export function formatTable(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

  return rows
    .map((row) =>
      row
        .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column])))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** `frogbot status`: prints a table of every app `up` started, and resolves to them for `--json`. */
export function status(args: string[] = []): { apps: Record<string, unknown>[] } {
  if (args.length) throw usageError('[frogbot] usage: frogbot status [--json]');

  const registrations = listRegistrations();
  const rows = statusRows(registrations);
  const apps = registrations.map((registration, i) => {
    const [folder, url, mode, state, uptime, lastError] = rows[i];

    return {
      folder,
      url,
      mode,
      state,
      ...(uptime !== '-' && { uptime }),
      ...(lastError && { lastError }),
      ...(registration.advisory &&
        isAlive(registration.pid) && { advisory: registration.advisory }),
    };
  });

  if (!rows.length) {
    console.log('[frogbot] no apps are up; start one with `frogbot up` in its folder');

    return { apps };
  }

  console.log(formatTable([['FOLDER', 'URL', 'MODE', 'STATE', 'UPTIME', 'LAST ERROR'], ...rows]));

  for (const line of advisoryLines(registrations)) console.log(line);

  return { apps };
}
