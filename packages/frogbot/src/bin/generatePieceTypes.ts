import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { format, resolveConfig } from 'prettier';

import { generatePieceTypes } from '../pieces/generateTypes.js';

export async function generatePieceTypesCommand(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: { export: { type: 'string' }, output: { type: 'string' }, check: { type: 'boolean' } },
  });
  if (positionals.length !== 1 || !values.export || !values.output) {
    throw new Error(
      '[frogbot] usage: frogbot generate:piece-types <module> --export <factory> --output <file> [--check]',
    );
  }
  const module = await import(pathToFileURL(resolve(positionals[0]!)).href);
  const output = resolve(values.output);
  const content = await format(await generatePieceTypes({ piece: module[values.export] }), {
    ...(await resolveConfig(output)),
    parser: 'typescript',
  });
  const existing = await readFile(output, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (existing === content) return;
  if (values.check) throw new Error(`[frogbot] Piece types are stale: ${output}`);
  await writeFile(output, content);
  console.log(`[frogbot] Piece types written to ${output}`);
}
