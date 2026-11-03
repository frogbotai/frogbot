import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

type ExecFile = (file: string, args: string[]) => Promise<unknown>;

const execFile: ExecFile = promisify(execFileCallback);

export const launchAgentLabel = (id: string) => `ai.frogbot.${id}`;

export const launchAgentFile = (id: string, home = homedir()) =>
  join(home, 'Library', 'LaunchAgents', `${launchAgentLabel(id)}.plist`);

/** The app's own `node_modules/frogbot/bin.js`, which a reinstall keeps, unlike its real path. */
export function launchAgentBin(dir: string, fallback: string): string {
  const bin = join(dir, 'node_modules', 'frogbot', 'bin.js');

  return existsSync(bin) ? bin : fallback;
}

export type LaunchAgent = {
  id: string;
  dir: string;
  /**
   * Absolute paths of `node` and of the app's `node_modules/frogbot/bin.js`, which a reinstall keeps;
   * a new Node needs `up --autostart` again.
   */
  node: string;
  bin: string;
  log: string;
  env: Record<string, string>;
};

const escape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const string = (text: string) => `<string>${escape(text)}</string>`;

/**
 * Restarts a supervisor that fails (`SuccessfulExit: false`) but not one that exits cleanly after
 * `down` or losing its registration; `ThrottleInterval` spaces restarts 10 s apart.
 */
export function launchAgentPlist({ id, dir, node, bin, log, env }: LaunchAgent): string {
  const variables = Object.entries(env)
    .map(([key, value]) => `      <key>${escape(key)}</key>\n      ${string(value)}`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    ${string(launchAgentLabel(id))}
    <key>ProgramArguments</key>
    <array>
      ${string(node)}
      ${string(bin)}
      ${string('up')}
    </array>
    <key>WorkingDirectory</key>
    ${string(dir)}
    <key>EnvironmentVariables</key>
    <dict>
${variables}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardInPath</key>
    ${string('/dev/null')}
    <key>StandardOutPath</key>
    ${string(log)}
    <key>StandardErrorPath</key>
    ${string(log)}
  </dict>
</plist>
`;
}

type Deps = { execFile?: ExecFile; uid?: number; home?: string };

const domain = (uid: number) => `gui/${uid}`;

/** Writes the plist, then `launchctl bootout` (when loaded), `enable` and `bootstrap`, which starts it. */
export async function installLaunchAgent(
  agent: LaunchAgent,
  { execFile: run = execFile, uid = process.getuid?.() ?? 0, home = homedir() }: Deps = {},
): Promise<string> {
  const file = launchAgentFile(agent.id, home);
  const service = `${domain(uid)}/${launchAgentLabel(agent.id)}`;

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, launchAgentPlist(agent), { mode: 0o644 });

  await run('launchctl', ['bootout', service]).catch(() => {});
  await run('launchctl', ['enable', service]);
  await run('launchctl', ['bootstrap', domain(uid), file]);

  return file;
}

/** `launchctl bootout`, so launchd stops restarting it, then removes the plist. `false` when none was installed. */
export async function uninstallLaunchAgent(
  id: string,
  { execFile: run = execFile, uid = process.getuid?.() ?? 0, home = homedir() }: Deps = {},
): Promise<boolean> {
  const file = launchAgentFile(id, home);

  if (!existsSync(file)) return false;

  await run('launchctl', ['bootout', `${domain(uid)}/${launchAgentLabel(id)}`]).catch(() => {});
  rmSync(file, { force: true });

  return true;
}
