import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

import type { CLICommand, Where } from 'frogbot';

import { exportTrainingData } from '../training/exportTrainingData.js';

type ParsedArgs = {
  where?: Where;
  output?: string;
  pageSize?: number;
};

export function parseExportTrainingDataArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < args.length; index += 1) {
    const [flag, inlineValue] = args[index].split(/=(.*)/s);
    const value = inlineValue ?? args[++index];

    if (value === undefined) {
      throw new Error(`missing value for ${flag}`);
    }

    if (flag === '--where') {
      try {
        parsed.where = JSON.parse(value) as Where;
      } catch {
        throw new Error('--where must be valid JSON');
      }
    } else if (flag === '--output') {
      parsed.output = value;
    } else if (flag === '--page-size') {
      const pageSize = Number(value);
      if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new Error('--page-size must be a positive integer');
      }

      parsed.pageSize = pageSize;
    } else {
      throw new Error(`unknown option ${flag}`);
    }
  }

  return parsed;
}

export const exportTrainingDataCommand: CLICommand = async ({ args, getFrogBot }) => {
  const { where, output, pageSize } = parseExportTrainingDataArgs(args);
  const frogbot = await getFrogBot({ disableOnInit: true });

  const stream = exportTrainingData(frogbot, { where, pageSize, overrideAccess: true });
  const destination = output ? createWriteStream(output) : process.stdout;

  await stream.pipeTo(Writable.toWeb(destination) as WritableStream<Uint8Array>);

  if (output) process.stdout.write(`[frogbot] training data written to ${output}\n`);
};
