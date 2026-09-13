import { mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildConfig } from '../../../../packages/frogbot/src/config/build.js';
import { writeGeneratedTypes } from '../../../../packages/frogbot/src/typegen/index.js';
import { jobsTypeConfig } from '../../../types/jobs/config.js';

describe('jobs generated consumer types', () => {
  it('generates task and workflow schemas through FrogBot config', async () => {
    const directory = fileURLToPath(new URL('../../../types/jobs/.generated/', import.meta.url));
    const outputFile = `${directory}frogbot-types.ts`;

    await mkdir(directory, { recursive: true });
    await rm(outputFile, { force: true });

    const config = await buildConfig({
      ...jobsTypeConfig,
      typescript: { outputFile },
    });

    const { outputPath, changed } = await writeGeneratedTypes(config, directory);
    const output = await readFile(outputPath, 'utf8');
    const repeated = await writeGeneratedTypes(config, directory);

    expect(changed).toBe(true);
    expect(outputPath).toBe(outputFile);
    expect(output).toContain("declare module 'frogbot'");
    expect(output).not.toContain("declare module 'payload'");
    expect(output).toContain("'send-notification': TaskSendNotification;");
    expect(output).toContain("'count-items': TaskCountItems;");
    expect(output).toContain("'onboard-account': WorkflowOnboardAccount;");
    expect(output).toContain('recipient: string;');
    expect(output).toContain('accountID: number;');
    expect(output).toContain('delivered: boolean;');
    expect(repeated).toEqual({ outputPath, changed: false });
  });
});
