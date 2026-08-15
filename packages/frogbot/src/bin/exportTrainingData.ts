import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';

import { loadConfig } from '../config/load.js';
import { Frogbot } from '../frogbot.js';
import type { Where } from '../types/payload.js';

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

export async function exportTrainingData(args: string[]): Promise<void> {
  let frogbot: Frogbot | undefined;

  try {
    const { where, output, pageSize } = parseExportTrainingDataArgs(args);
    const config = await loadConfig({ cwd: process.cwd() });
    frogbot = await new Frogbot().init({ config, disableOnInit: true });

    const stream = frogbot.exportTrainingData({ where, pageSize, overrideAccess: true });
    const destination = output ? createWriteStream(output) : process.stdout;

    await stream.pipeTo(Writable.toWeb(destination) as WritableStream<Uint8Array>);

    if (output) console.log(`[frogbot] training data written to ${output}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${message}`);
    process.exitCode = 1;
  } finally {
    await frogbot?.destroy();
  }
}
