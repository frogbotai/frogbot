import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { uninstallLaunchAgent } from './service/launchAgent.js';
import { appDir, appPaths, registrationFile, serviceId } from './service/paths.js';
import { isAlive, owns, readRegistration, removeRegistration } from './service/registration.js';
import { stopProcess } from './service/stop.js';

type Deps = { uninstall?: typeof uninstallLaunchAgent; log?: (line: string) => void };

/**
 * Stops the app in `folder` (the current one by default): its LaunchAgent first, else launchd would
 * start it again, then the supervisor and any server it left, then its registration and builds.
 */
export async function down(
  args: string[] = [],
  { uninstall = uninstallLaunchAgent, log = console.log }: Deps = {},
): Promise<void> {
  const dir = appDir(resolve(args[0] ?? process.cwd()));
  const id = serviceId(dir);
  const file = registrationFile(id);
  const found = readRegistration(file);

  const agent = process.platform === 'darwin' && (await uninstall(id));

  if (!found || !isAlive(found.pid)) {
    if (found) removeRegistration(file, found);
    if (found && isAlive(found.serverPid)) await stopProcess(found.serverPid, { group: true });

    log(
      agent
        ? `[frogbot] removed the LaunchAgent; ${dir} wasn't running`
        : `[frogbot] ${dir} is not running`,
    );

    return;
  }

  if (owns(readRegistration(file), found)) await stopProcess(found.pid);
  await stopProcess(found.serverPid, { group: true });
  removeRegistration(file, found);
  rmSync(appPaths(dir).builds, { recursive: true, force: true });

  log(`[frogbot] stopped ${dir}`);
}
