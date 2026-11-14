import { runDeploy } from 'frogbot/internal';

import type { DeployIO } from '../../../../packages/frogbot/src/bin/deploy/types.js';
import { dojoTarget } from '../../../../packages/plugins/plugin-dojo/src/deploy.js';

/** `frogbot deploy dojo` with this IO, the way core runs the target. */
export function deployDojo(argv: string[], io: DeployIO): Promise<number> {
  return runDeploy(dojoTarget, argv, io, { name: 'dojo' });
}
