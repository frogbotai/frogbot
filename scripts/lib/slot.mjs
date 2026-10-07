// Heavy test runs (int, gateway-integration, e2e, browser, test-types) each take one of SLOTS slot
// files in a directory every worktree shares, so parallel worktrees never run more than SLOTS at
// once. A slot file holds its owner's pid; a slot whose owner is dead is free again. As a script,
// `node scripts/lib/slot.mjs <name>` holds a slot until its stdin closes, for Playwright's webServer.
// `pnpm ticket land` takes the single LAND_LOCK slot in its own directory, so lands run one at a time.
import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SLOTS = 3;

export const SLOT_DIR = path.join(os.tmpdir(), 'frogbot-heavy-slots');

export const LAND_LOCK = {
  dir: path.join(os.tmpdir(), 'frogbot-land-lock'),
  slots: 1,
  noun: 'the land lock',
};

const alive = (pid) => {
  try {
    return process.kill(pid, 0);
  } catch (error) {
    return error.code === 'EPERM';
  }
};

const holder = (file) => {
  try {
    const [pid, ...label] = readFileSync(file, 'utf8').trim().split(' ');

    return { pid: Number(pid), label: label.join(' ') };
  } catch {
    return null;
  }
};

const attempt = (fn) => {
  try {
    fn();

    return true;
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'ENOENT') return false;
    throw error;
  }
};

// A slot is taken by hard-linking a finished file to its name, which fails if the name exists.
// Reclaiming renames the dead slot aside first, so of two processes reclaiming it only one moves
// the dead file; the other may move the winner's new file instead, and links it back.
function take(files, pid, label) {
  const temp = path.join(path.dirname(files[0]), `${randomUUID()}.tmp`);

  for (const file of files) {
    const owner = holder(file);

    if (owner && !alive(owner.pid)) {
      const aside = `${temp}.stale`;

      if (attempt(() => renameSync(file, aside))) {
        if (alive(holder(aside)?.pid)) attempt(() => linkSync(aside, file));
        unlinkSync(aside);
      }
    }
  }

  writeFileSync(temp, `${pid} ${label}`);

  try {
    return files.find((file) => attempt(() => linkSync(temp, file)));
  } finally {
    unlinkSync(temp);
  }
}

export async function acquireSlot(
  name,
  {
    dir = SLOT_DIR,
    slots = SLOTS,
    noun = 'a heavy-test slot',
    pid = process.pid,
    interval = 2000,
    log = console.log,
  } = {},
) {
  const label = `${name} · ${path.basename(process.cwd())}`;
  const files = Array.from({ length: slots }, (_, index) => path.join(dir, `slot-${index}`));

  mkdirSync(dir, { recursive: true });

  // One slot per process: a run whose several projects each ask holds just the first.
  if (files.some((file) => holder(file)?.pid === pid)) return () => {};

  for (let waiting = false; ; waiting = true) {
    const slot = take(files, pid, label);

    if (slot) {
      const release = () => {
        process.off('exit', release);
        if (holder(slot)?.pid === pid) attempt(() => unlinkSync(slot));
      };

      process.on('exit', release);

      return release;
    }

    if (!waiting) {
      const held = files.map((file) => holder(file)?.label).filter(Boolean);

      log(`waiting for ${noun} (held by: ${held.join(', ')})`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await acquireSlot(process.argv[2] ?? 'heavy');
  console.log('ready');
  process.stdin.resume().on('end', () => process.exit(0));
}
