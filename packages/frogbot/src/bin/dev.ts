// The `frogbot dev` command.
// Boots the server with file watching (development mode).
// Uses tsx watch to restart on config changes.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function dev() {
  const cwd = process.cwd();
  const binPath = fileURLToPath(new URL('./index.js', import.meta.url));

  console.log('[frogbot] dev mode — watching for config changes');

  const child = spawn('tsx', ['watch', binPath, 'start'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, FROGBOT_WATCH_MODE: 'true' },
  });

  const gracefulShutdown = () => {
    console.log('\n[frogbot] terminating watcher');
    child.kill();
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}
