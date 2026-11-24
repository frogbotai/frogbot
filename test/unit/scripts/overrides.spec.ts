import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  pnpmMajor,
  workspaceWithOverrides,
  writeOverrides,
} from '../../../scripts/lib/overrides.mjs';

const overrides = { '@frogbotai/ui': 'file:/packs/ui.tgz', frogbot: 'file:/packs/frogbot.tgz' };
let dir: string;

function fakePnpm(version: string): NodeJS.ProcessEnv {
  const bin = path.join(dir, 'bin');

  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });

  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
}

function read(file: string): string {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frogbot-overrides-'));

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'app', pnpm: { overrides: { stale: '1.0.0' } } }),
  );
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(process.platform === 'win32')('writeOverrides', () => {
  it('asks the pnpm that runs in the directory for its major version', () => {
    expect(pnpmMajor(dir, fakePnpm('9.15.4'))).toBe(9);
    expect(pnpmMajor(dir, fakePnpm('12.23.0'))).toBe(12);
  });

  it('writes package.json pnpm.overrides for pnpm before 11', () => {
    writeOverrides(dir, overrides, { env: fakePnpm('10.4.1') });

    expect(JSON.parse(read('package.json')).pnpm).toEqual({ overrides });
    expect(fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))).toBe(false);
  });

  it('writes pnpm-workspace.yaml overrides and drops the package.json field for pnpm 11 and later', () => {
    writeOverrides(dir, overrides, { env: fakePnpm('12.23.0') });

    expect(JSON.parse(read('package.json'))).toEqual({ name: 'app' });
    expect(read('pnpm-workspace.yaml')).toBe(
      'overrides:\n  "@frogbotai/ui": "file:/packs/ui.tgz"\n  "frogbot": "file:/packs/frogbot.tgz"\n',
    );
  });

  it('keeps the other workspace settings and replaces an earlier overrides block', () => {
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      "packages:\n  - '.'\noverrides:\n  old: 1.0.0\n\nallowBuilds:\n  sharp: true\n",
    );

    writeOverrides(dir, { frogbot: 'file:/packs/frogbot.tgz' }, { major: 12 });

    expect(read('pnpm-workspace.yaml')).toBe(
      'packages:\n  - \'.\'\nallowBuilds:\n  sharp: true\noverrides:\n  "frogbot": "file:/packs/frogbot.tgz"\n',
    );
  });

  it.each([
    ['an inline map', 'packages:\n  - .\noverrides: {}\n', 'packages:\n  - .\n'],
    ['a trailing comment', 'overrides: # pinned\n  old: 1.0.0\n', ''],
    ['a quoted key', '"overrides":\n  old: 1.0.0\nallowBuilds: {}\n', 'allowBuilds: {}\n'],
  ])('replaces an overrides key written as %s', (_, yaml, kept) => {
    expect(workspaceWithOverrides(yaml, { frogbot: 'file:/f.tgz' })).toBe(
      `${kept}overrides:\n  "frogbot": "file:/f.tgz"\n`,
    );
  });
});
