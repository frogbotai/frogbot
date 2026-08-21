import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import { loadConfig } from '../config/load.js';
import { Frogbot } from '../frogbot.js';
import type { Where } from '../types/payload.js';
import { type ExportCapturesArgs, parseExportCapturesArgs } from './exportCapturesArgs.js';
import { writeCaptureLine } from './exportCapturesStream.js';

const gunzipAsync = promisify(gunzip);

type CaptureRegistration = {
  collectionSlug: string;
  storage: { get(key: string): Promise<Uint8Array> };
};

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

export async function exportCaptures(args: string[]): Promise<void> {
  let frogbot: Frogbot | undefined;
  let destination: ReturnType<typeof createWriteStream> | undefined;
  try {
    const parsed = parseExportCapturesArgs(args);
    const config = await loadConfig({ cwd: process.cwd() });
    const payloadConfig = await config._internal.payloadConfig;
    const registration = payloadConfig.custom?.frogbotCapture as CaptureRegistration | undefined;
    if (!registration) throw new Error('@frogbotai/plugin-capture is not configured');
    frogbot = await new Frogbot().init({ config, disableOnInit: true });
    destination = parsed.output ? createWriteStream(parsed.output) : undefined;
    const output = destination ?? process.stdout;
    let page = 1;
    while (true) {
      const result = await frogbot.find({
        collection: registration.collectionSlug as never,
        where: whereFor(parsed),
        depth: 0,
        limit: 100,
        page,
        sort: 'requestedAt',
        overrideAccess: true,
      });
      for (const value of result.docs) {
        const blobKey = String((value as Record<string, unknown>).blobKey);
        const json = (await gunzipAsync(await registration.storage.get(blobKey))).toString('utf8');
        await writeCaptureLine(output, json);
      }
      if (!result.hasNextPage) break;
      page = result.nextPage ?? page + 1;
    }
    if (destination) {
      await new Promise<void>((resolve, reject) =>
        destination!.end((error?: Error) => (error ? reject(error) : resolve())),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[frogbot] ${message}`);
    process.exitCode = 1;
  } finally {
    await frogbot?.destroy();
  }
}
