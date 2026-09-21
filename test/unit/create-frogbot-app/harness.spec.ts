import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run, subprocessEnvironment } from '../../e2e/fixtures/create-frogbot-app/harness.js';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'create-frogbot-app-environment-'));

  for (const [key, value] of Object.entries({
    DATABASE_URL: 'file:/outside-fixture/caller.db',
    FROGBOT_SECRET: 'caller-secret',
    FROGBOT_CONFIG_PATH: '/outside-fixture/frogbot.config.ts',
    FROGBOT_TS_OUTPUT_PATH: '/outside-fixture/types.ts',
    PAYLOAD_DROP_DATABASE: 'true',
    NODE_OPTIONS: '--import=/outside-fixture/hook.mjs',
    NODE_ENV: 'production',
    OPENAI_API_KEY: 'caller-key',
    AWS_PROFILE: 'caller-profile',
    GIT_DIR: '/outside-fixture/.git',
    npm_config_prefix: '/outside-fixture/prefix',
  })) {
    vi.stubEnv(key, value);
  }

  fs.writeFileSync(path.join(root, '.env'), 'DATABASE_URL=file:/outside-fixture/env.db\n');
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('generated app subprocess environment', () => {
  it('overrides the parent and dotenv database with a per-app URL in a real child', () => {
    const result = run(
      process.execPath,
      ['-e', 'process.loadEnvFile(); console.log(JSON.stringify(process.env))'],
      { cwd: root },
    );

    expect(result.status, result.output).toBe(0);

    const env = JSON.parse(result.output) as NodeJS.ProcessEnv;

    expect(env.DATABASE_URL).toBe(`file:${path.join(root, 'frogbot.db')}`);
    expect(env.FROGBOT_SECRET).toBe('create-frogbot-app-e2e-secret');
    expect(env.PATH).toBe(process.env.PATH);

    for (const key of [
      'FROGBOT_CONFIG_PATH',
      'FROGBOT_TS_OUTPUT_PATH',
      'PAYLOAD_DROP_DATABASE',
      'NODE_OPTIONS',
      'NODE_ENV',
      'OPENAI_API_KEY',
      'AWS_PROFILE',
      'GIT_DIR',
      'npm_config_prefix',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
  });

  it.each([
    'postgres://frogbot:frogbot@127.0.0.1:5433/frogbot',
    'mongodb://127.0.0.1:27018/frogbot-test?directConnection=true&replicaSet=rs0',
  ])('retains the intentional database selection %s', (databaseUrl) => {
    const result = run(process.execPath, ['-e', 'console.log(process.env.DATABASE_URL)'], {
      cwd: root,
      env: { DATABASE_URL: databaseUrl },
    });

    expect(result.status, result.output).toBe(0);
    expect(result.output.trim()).toBe(databaseUrl);
    expect(subprocessEnvironment(root, { DATABASE_URL: databaseUrl }).DATABASE_URL).toBe(
      databaseUrl,
    );
  });

  it('uses different database files for different generated apps', () => {
    const first = subprocessEnvironment(path.join(root, 'first'));
    const second = subprocessEnvironment(path.join(root, 'second'));

    expect(first.DATABASE_URL).not.toBe(second.DATABASE_URL);
    expect(first.DATABASE_URL).toBe(`file:${path.join(root, 'first', 'frogbot.db')}`);
    expect(second.DATABASE_URL).toBe(`file:${path.join(root, 'second', 'frogbot.db')}`);
  });
});
