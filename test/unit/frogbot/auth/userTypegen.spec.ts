import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { writeGeneratedTypes } from '../../../../packages/frogbot/src/typegen/index.js';
import { authTypeConfig } from '../../../types/auth/config.js';

describe('auth generated consumer types', () => {
  it('generates a user union with one entry per auth collection', async () => {
    const directory = fileURLToPath(new URL('../../../types/auth/.generated/', import.meta.url));
    const outputFile = `${directory}frogbot-types.ts`;

    await mkdir(directory, { recursive: true });
    await rm(outputFile, { force: true });

    const config = await buildConfig({
      ...authTypeConfig,
      typescript: { outputFile },
    });

    const { outputPath } = await writeGeneratedTypes(config, directory);
    const output = await readFile(outputPath, 'utf8');

    expect(outputPath).toBe(outputFile);
    expect(output).toContain("declare module 'frogbot'");
    expect(output).toContain('user: User | Admin;');
    expect(output).toContain("collection: 'users';");
    expect(output).toContain("collection: 'admins';");
    expect(output).toContain('nickname?: string | null;');
    expect(output).toContain('level: number;');
  });
});
