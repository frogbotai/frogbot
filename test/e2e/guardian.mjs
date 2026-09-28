// Process-group guardian for test servers.
//
//   node test/e2e/guardian.mjs <command> [...args]
//
// `spawnServer` (./process.ts) starts this as the leader of a fresh process
// group. It runs <command> inside that group and kills the whole group as soon
// as the test process that spawned it disappears, however that happens:
// normal exit, Ctrl-C, crash, SIGKILL or OOM. Without it, `next dev` and its
// `next-server` workers outlive a killed vitest run (about 2 GB each) and
// pile up across runs until the machine runs out of memory.
//
// It detects parent death two ways: its stdin pipe from the parent hits EOF
// (immediate), and its parent PID changes (polled once a second as a backup).
import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write('guardian: missing command\n');
  process.exit(2);
}

const parent = process.ppid;
let finishing = false;

// Parent is gone: nothing may survive, including this process.
function killEverything() {
  try {
    process.kill(-process.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
    process.exit(1);
  }
}

const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });

child.once('error', (error) => {
  process.stderr.write(`guardian: ${error.message}\n`);
  killEverything();
});

// The server exited on its own. Stop any stragglers in the group, then exit
// with the server's code so callers can still report "exited with code N".
child.once('exit', (code, signal) => {
  finishing = true;
  try {
    process.kill(-process.pid, 'SIGTERM');
  } catch {
    // Group already empty.
  }
  process.exit(code ?? (signal ? 1 : 0));
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (!finishing) killEverything();
  });
}

process.stdin.on('end', killEverything);
process.stdin.on('close', killEverything);
process.stdin.on('error', killEverything);
process.stdin.resume();

setInterval(() => {
  if (process.ppid !== parent) killEverything();
}, 1000);
