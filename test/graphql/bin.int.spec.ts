import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hiddenTypeNames } from './shared.js';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, '../..');
const binPath = join(repoRoot, 'packages/graphql/bin.js');
const tempRoot = join(repoRoot, 'test/.tmp');

type BinResult = { code: number; stdout: string; stderr: string };

async function runBin({
  args = ['generate:schema'],
  configPath,
  cwd,
}: {
  args?: string[];
  configPath?: string;
  cwd: string;
}): Promise<BinResult> {
  const env = { ...process.env };

  delete env.FROGBOT_CONFIG_PATH;

  if (configPath) env.FROGBOT_CONFIG_PATH = resolve(import.meta.dirname, configPath);

  return execFileAsync(process.execPath, [binPath, ...args], { cwd, env }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code: number; stdout: string; stderr: string }) => ({
      code: error.code,
      stdout: error.stdout,
      stderr: error.stderr,
    }),
  );
}

describe('frogbot-graphql bin', () => {
  let cwd: string;

  beforeEach(async () => {
    await mkdir(tempRoot, { recursive: true });

    cwd = await mkdtemp(join(tempRoot, 'graphql-bin-'));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it('generate:schema writes schema.graphql in the working directory', async () => {
    const result = await runBin({ cwd, configPath: 'config.ts' });

    const outputFile = join(cwd, 'schema.graphql');
    const sdl = await readFile(outputFile, 'utf8');

    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`[frogbot] GraphQL schema written to ${outputFile}`);
    expect(sdl).toContain('type Post {');
    expect(sdl).toMatch(/\bsearchPosts\(/);
    expect(sdl).toMatch(/\bpostTotal: Int!/);

    for (const typeName of hiddenTypeNames) {
      expect(sdl).not.toMatch(new RegExp(`\\b${typeName}`));
    }
  });

  it('generate:schema writes a relative schemaOutputFile from the working directory', async () => {
    const result = await runBin({ cwd, configPath: 'bin/customOutput.config.ts' });

    const sdl = await readFile(join(cwd, 'generated/nested/app.graphql'), 'utf8');

    expect(result.code, result.stderr).toBe(0);
    expect(sdl).toContain('type User {');
  });

  it('generate:schema loads a config in codegen mode', async () => {
    const result = await runBin({ cwd, configPath: 'bin/unconfiguredProvider.config.ts' });

    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toContain(
      "[frogbot] Agent 'assistant' model 'unconfigured/model' is not configured.",
    );
    await expect(readFile(join(cwd, 'schema.graphql'), 'utf8')).resolves.toContain('type User {');
  });

  it('generate:schema without a config names the searched directories and FROGBOT_CONFIG_PATH', async () => {
    const result = await runBin({ cwd });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`could not find frogbot.config.{ts,js,mjs} in ${cwd}`);
    expect(result.stderr).toContain(join(cwd, 'src'));
    expect(result.stderr).toContain('FROGBOT_CONFIG_PATH');
  });

  it('generate:schema rejects a default export that is not a FrogBot config', async () => {
    const result = await runBin({ cwd, configPath: 'bin/invalid.config.ts' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('default export is not a FrogBotSanitizedConfig');
  });

  it('an unknown command exits 2 with usage', async () => {
    const result = await runBin({ cwd, args: ['generate:types'] });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('[frogbot] usage: frogbot-graphql generate:schema');
  });

  it('generate:schema exits 1 and names a config that throws while loading', async () => {
    const result = await runBin({ cwd, configPath: 'bin/throwing.config.ts' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('failed to load');
    expect(result.stderr).toContain(resolve(import.meta.dirname, 'bin/throwing.config.ts'));
  });

  it('generate:schema rejects a nonexistent FROGBOT_CONFIG_PATH', async () => {
    const result = await runBin({ cwd, configPath: 'bin/nonexistent.config.ts' });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FROGBOT_CONFIG_PATH');
    expect(result.stderr).toContain('nonexistent.config.ts');
  });

  it('a missing command exits 2 with usage', async () => {
    const result = await runBin({ cwd, args: [] });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('[frogbot] usage: frogbot-graphql generate:schema');
  });
});
