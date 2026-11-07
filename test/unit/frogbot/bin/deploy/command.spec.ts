import { describe, expect, it } from 'vitest';

import { deploy } from '../../../../../packages/frogbot/src/bin/deploy/command.js';
import type { DeployTarget } from '../../../../../packages/frogbot/src/bin/deploy/types.js';
import type { FrogBotSanitizedConfig } from '../../../../../packages/frogbot/src/config/sanitized.js';
import { deployConfig, recordingTarget, tempDir, testIO, writeApp } from './helpers.js';

function appConfig(deployTargets: Record<string, DeployTarget> = {}): FrogBotSanitizedConfig {
  const config = {
    cli: { commands: {}, deployTargets },
    _internal: { payloadConfig: Promise.resolve(deployConfig()) },
  };

  return config as unknown as FrogBotSanitizedConfig;
}

describe('frogbot deploy', () => {
  it('runs a target a plugin registered', async () => {
    const root = await tempDir();
    const { target, seen } = recordingTarget();
    const io = testIO({ cwd: root, programs: { tool: () => undefined } });

    await writeApp(root);

    expect(await deploy(['dojo', '--x'], { config: appConfig({ dojo: target }), io: io.io })).toBe(
      0,
    );
    expect(seen).toEqual({ args: ['--x'], ran: true });
  });

  it('runs dojo when no target is named and dojo is registered', async () => {
    const root = await tempDir();
    const { target, seen } = recordingTarget();
    const io = testIO({ cwd: root, programs: { tool: () => undefined } });

    await writeApp(root);

    expect(await deploy(['--dry-run'], { config: appConfig({ dojo: target }), io: io.io })).toBe(0);
    expect(seen.args).toEqual([]);
    expect(io.stdout()).toContain('[frogbot] Dry run of deploy dojo: nothing was changed.');
  });

  it('lists the targets and exits 2 with no target and no dojo', async () => {
    const io = testIO({ cwd: await tempDir() });

    expect(await deploy([], { config: appConfig(), io: io.io })).toBe(2);
    expect(io.stderr()[0]).toBe(
      '[frogbot] usage: frogbot deploy <target> [--dry-run] [--json] [--no-interactive] [--env-file <path>]',
    );
    expect(
      io
        .stderr()
        .slice(2)
        .map((line) => line.trim().split(/\s+/)[0]),
    ).toEqual(['docker', 'fly', 'gcp', 'aws', 'azure']);
  });

  it('names an unknown target, lists the targets and exits 2', async () => {
    const io = testIO({ cwd: await tempDir() });

    expect(
      await deploy(['heroku'], {
        config: appConfig({ dojo: recordingTarget().target }),
        io: io.io,
      }),
    ).toBe(2);
    expect(io.stderr()[0]).toBe('[frogbot] "heroku" isn\'t a deploy target.');
    expect(io.stderr().some((line) => line.trim().startsWith('dojo'))).toBe(true);
  });

  it('prints one JSON result on stdout for an unknown target under --json', async () => {
    const io = testIO({ cwd: await tempDir() });

    expect(await deploy(['nope', '--json'], { config: appConfig(), io: io.io })).toBe(2);
    expect(io.stdout()).toHaveLength(1);
    expect(JSON.parse(io.stdout()[0] ?? '')).toMatchObject({
      target: 'nope',
      ok: false,
      issues: [{ code: 'UNKNOWN_TARGET' }],
    });
  });

  it("prints the load error and exits 2 for a target it can't find when the config failed to load", async () => {
    const io = testIO({ cwd: await tempDir() });

    expect(
      await deploy(['dojo'], { loadError: new Error('[frogbot] broken config'), io: io.io }),
    ).toBe(2);
    expect(io.stderr()[0]).toContain('broken config');
    expect(io.stderr()[1]).toBe('[frogbot] "dojo" isn\'t a deploy target.');
  });
});
