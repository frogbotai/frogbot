import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installLaunchAgent,
  launchAgentBin,
  launchAgentFile,
  launchAgentPlist,
  uninstallLaunchAgent,
} from '../../../../../packages/frogbot/src/bin/service/launchAgent.js';

const agent = {
  id: 'abc123def456',
  dir: '/Users/me/apps/crm',
  node: '/usr/local/bin/node',
  bin: '/Users/me/apps/crm/node_modules/frogbot/bin.js',
  log: '/Users/me/apps/crm/.frogbot/launchd.log',
  env: { FROGBOT_SERVICE: 'supervise', PATH: '/usr/bin' },
};

describe('LaunchAgent', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'frogbot-launchd-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('runs `frogbot up` in the app at login and restarts it only when it fails', () => {
    const plist = launchAgentPlist(agent);

    expect(plist).toContain('<key>Label</key>\n    <string>ai.frogbot.abc123def456</string>');
    expect(plist).toMatch(
      /<key>ProgramArguments<\/key>\s*<array>\s*<string>\/usr\/local\/bin\/node<\/string>\s*<string>[^<]*bin\.js<\/string>\s*<string>up<\/string>/,
    );
    expect(plist).toContain('<key>WorkingDirectory</key>\n    <string>/Users/me/apps/crm</string>');
    expect(plist).toContain('<key>FROGBOT_SERVICE</key>\n      <string>supervise</string>');
    expect(plist).toContain('<key>RunAtLoad</key>\n    <true/>');
    expect(plist).toMatch(
      /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/,
    );
    expect(plist).toContain('<key>ThrottleInterval</key>\n    <integer>10</integer>');
    expect(plist).toContain(`<key>StandardErrorPath</key>\n    <string>${agent.log}</string>`);
  });

  it('escapes XML in paths', () => {
    expect(launchAgentPlist({ ...agent, dir: '/apps/R&D <x>' })).toContain(
      '<string>/apps/R&amp;D &lt;x&gt;</string>',
    );
  });

  it('writes the plist, then calls bootout, enable and bootstrap in order', async () => {
    const execFile = vi.fn((_file: string, args: string[]) =>
      args[0] === 'bootout' ? Promise.reject(new Error('not loaded')) : Promise.resolve(),
    );

    const file = await installLaunchAgent(agent, { execFile, uid: 501, home });

    expect(file).toBe(join(home, 'Library', 'LaunchAgents', 'ai.frogbot.abc123def456.plist'));
    expect(readFileSync(file, 'utf8')).toBe(launchAgentPlist(agent));
    expect(statSync(file).mode & 0o777).toBe(0o644);
    expect(execFile.mock.calls).toEqual([
      ['launchctl', ['bootout', 'gui/501/ai.frogbot.abc123def456']],
      ['launchctl', ['enable', 'gui/501/ai.frogbot.abc123def456']],
      ['launchctl', ['bootstrap', 'gui/501', file]],
    ]);
  });

  it('boots out and removes the plist on uninstall, and does nothing when none is installed', async () => {
    const execFile = vi.fn(() => Promise.resolve());

    expect(await uninstallLaunchAgent(agent.id, { execFile, uid: 501, home })).toBe(false);
    expect(execFile).not.toHaveBeenCalled();

    await installLaunchAgent(agent, { execFile, uid: 501, home });
    execFile.mockClear();

    expect(await uninstallLaunchAgent(agent.id, { execFile, uid: 501, home })).toBe(true);
    expect(execFile.mock.calls).toEqual([
      ['launchctl', ['bootout', 'gui/501/ai.frogbot.abc123def456']],
    ]);
    expect(existsSync(launchAgentFile(agent.id, home))).toBe(false);
  });

  it("runs the app's node_modules/frogbot/bin.js, which a reinstall keeps, not its store path", () => {
    const app = join(home, 'app');
    const bin = join(app, 'node_modules', 'frogbot', 'bin.js');
    const store = '/store/frogbot@0.39.0_hash/node_modules/frogbot/bin.js';

    expect(launchAgentBin(app, store)).toBe(store);

    mkdirSync(join(app, 'node_modules', 'frogbot'), { recursive: true });
    writeFileSync(bin, '');

    expect(launchAgentBin(app, store)).toBe(bin);
  });
});
