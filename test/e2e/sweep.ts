// Vitest globalSetup for the e2e project. Before any spec starts, kill
// orphaned test servers left over from earlier killed runs, so a new run never
// stacks on top of them.
//
// Only orphans are touched: processes whose parent is gone (ppid 1) and whose
// command line runs this repo's `next` or the test guardian. A live
// `pnpm dev` keeps its parent, so it is never matched.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

type Row = { pid: number; ppid: number; rss: number; command: string };

function processTable(): Row[] {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' });
  return output.split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match
      ? [{ pid: Number(match[1]), ppid: Number(match[2]), rss: Number(match[3]), command: match[4] }]
      : [];
  });
}

export function findOrphans(rows: Row[], root = repoRoot): Row[] {
  const byParent = new Map<number, Row[]>();
  for (const row of rows) byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row]);

  const roots = rows.filter(
    (row) =>
      row.ppid === 1 &&
      row.command.includes(root) &&
      (/[/\\]next[/\\]dist[/\\]bin[/\\]next\b/.test(row.command) ||
        row.command.includes('test/e2e/guardian.mjs')),
  );
  const found = new Map<number, Row>();
  const visit = (row: Row) => {
    if (found.has(row.pid)) return;
    found.set(row.pid, row);
    byParent.get(row.pid)?.forEach(visit);
  };
  roots.forEach(visit);
  return [...found.values()];
}

export default function setup(): void {
  if (process.platform === 'win32') return;
  const orphans = findOrphans(processTable());
  if (orphans.length === 0) return;

  for (const { pid } of orphans) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  const mb = Math.round(orphans.reduce((sum, row) => sum + row.rss, 0) / 1024);
  process.stderr.write(
    `[e2e] killed ${orphans.length} orphaned test server process(es) from an earlier run (~${mb} MB)\n`,
  );
}
