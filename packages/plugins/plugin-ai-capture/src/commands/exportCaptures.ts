import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import type { CLICommand, Where } from 'frogbot';

import type { CaptureStorage } from '../types.js';
import { type ExportCapturesArgs, parseExportCapturesArgs } from './exportCapturesArgs.js';
import { writeCaptureLine } from './exportCapturesStream.js';

const gunzipAsync = promisify(gunzip);

function whereFor(args: ExportCapturesArgs): Where | undefined {
  const and: Record<string, unknown>[] = [];
  if (args.user) and.push({ user: { equals: args.user } });
  if (args.apiKey) and.push({ apiKey: { equals: args.apiKey } });
  if (args.operation) and.push({ operation: { equals: args.operation } });
  if (args.from) {
    and.push({ requestedAt: { greater_than_equal: new Date(args.from).toISOString() } });
  }

  if (args.to) and.push({ requestedAt: { less_than_equal: new Date(args.to).toISOString() } });

  return and.length ? ({ and } as Where) : undefined;
}

export function exportCapturesCommand({
  collectionSlug,
  storage,
}: {
  collectionSlug: string;
  storage: CaptureStorage;
}): CLICommand {
  return async ({ args, getFrogBot }) => {
    const parsed = parseExportCapturesArgs(args);
    const frogbot = await getFrogBot({ disableOnInit: true });
    const destination = parsed.output ? createWriteStream(parsed.output) : undefined;
    const output = destination ?? process.stdout;
    let page = 1;

    while (true) {
      const result = await frogbot.find({
        collection: collectionSlug,
        where: whereFor(parsed),
        depth: 0,
        limit: 100,
        page,
        sort: 'requestedAt',
        overrideAccess: true,
      });

      for (const value of result.docs) {
        const blobKey = String((value as Record<string, unknown>).blobKey);
        const json = (await gunzipAsync(await storage.get(blobKey))).toString('utf8');
        await writeCaptureLine(output, json);
      }

      if (!result.hasNextPage) break;
      page = result.nextPage ?? page + 1;
    }

    if (destination) {
      await new Promise<void>((resolve, reject) =>
        destination.end((error?: Error) => (error ? reject(error) : resolve())),
      );
    }
  };
}
