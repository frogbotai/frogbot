import { spawn } from 'node:child_process';

import { resolveNextBin } from '../runNext.js';
import { HOST } from './ports.js';
import { type AppRuntime, nextRuntime, withLifeline } from './runtime.js';

/** What `frogbot up --dev` runs: `next dev`, with no build of its own. */
export type DevRuntime = Omit<AppRuntime, 'build'>;

/**
 * Runs `next dev` behind the supervisor's proxy, so `src/` and `public/` edits hot reload. It uses
 * Next's own `.next`, never a build slot. `FROGBOT_SUPERVISED` tells `withFrogBot` that no one reads
 * the output, as for production builds, so Next's agent upgrade notice, which exits to be seen,
 * stays off.
 */
export const devRuntime: DevRuntime = {
  prepare: nextRuntime.prepare,

  start(app, _slot, port) {
    const child = spawn(
      process.execPath,
      [resolveNextBin(app.dir), 'dev', '-p', String(port), '-H', HOST],
      {
        cwd: app.dir,
        detached: true,
        ...withLifeline({
          ...app.env,
          NODE_ENV: 'development',
          FROGBOT_SUPERVISED: '1',
          FROGBOT_DIST_DIR: undefined,
          FROGBOT_SERVICE: undefined,
        }),
      },
    );

    const toLog = app.log.stream('dev server');

    child.stdout?.on('data', toLog);
    child.stderr?.on('data', toLog);

    return child;
  },
};
