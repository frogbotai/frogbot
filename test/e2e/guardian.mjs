import { spawn } from 'node:child_process';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write('guardian: missing command\n');
  process.exit(2);
}

const parent = process.ppid;
let finishing = false;

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

child.once('exit', (code, signal) => {
  finishing = true;
  try {
    process.kill(-process.pid, 'SIGTERM');
  } catch {}

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
