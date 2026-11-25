import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { format, resolveConfig } from 'prettier';

import { generatePieceTypes } from '../pieces/generateTypes.js';
import { CliError, usageError } from './json.js';

export async function generatePieceTypesCommand(
  args: string[],
): Promise<{ path: string; changed: boolean }> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: { export: { type: 'string' }, output: { type: 'string' }, check: { type: 'boolean' } },
  });

  if (positionals.length !== 1 || !values.export || !values.output) {
    throw usageError(
      '[frogbot] usage: frogbot generate:piece-types <module> --export <factory> --output <file> [--check] [--json]',
    );
  }

  const module = await import(pathToFileURL(resolve(positionals[0])).href);
  const output = resolve(values.output);
  const content = await format(await generatePieceTypes({ piece: module[values.export] }), {
    ...(await resolveConfig(output)),
    parser: 'typescript',
  });

  const existing = await readFile(output, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;

    return undefined;
  });

  if (existing === content) return { path: output, changed: false };
  if (values.check) {
    throw new CliError(`[frogbot] Piece types are stale: ${output}`, { code: 'TYPES_STALE' });
  }

  await writeFile(output, content);
  console.log(`[frogbot] Piece types written to ${output}`);

  return { path: output, changed: true };
}
