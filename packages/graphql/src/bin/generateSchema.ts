import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { configToSchema } from '@payloadcms/graphql';
import { getPayloadConfig } from 'frogbot/internal';
import { printSchema } from 'graphql';

import type { FrogBotConfigArg } from '../types.js';

export async function generateSchema(config: FrogBotConfigArg): Promise<string> {
  const payloadConfig = await getPayloadConfig(config);
  const outputFile = resolve(payloadConfig.graphQL.schemaOutputFile);
  const { schema } = configToSchema(payloadConfig);

  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, printSchema(schema));

  return outputFile;
}
