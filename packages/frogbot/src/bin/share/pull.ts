import { randomBytes } from 'node:crypto';
import { lstat, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import { x } from 'tar';

import { createDojo, dojoMessage } from './dojo.js';
import { ShareError } from './error.js';
import type { ShareIO } from './io.js';
import { say } from './io.js';
import { writeLink } from './link.js';

const usage = 'Usage: frogbot pull <app>';

const slugPattern = /^[a-z0-9][a-z0-9-]*$/;

type App = { id: string | number; slug: string };

/** Runs `frogbot pull <app>` and returns its exit code; known stops print one `[frogbot]` line. */
export async function runPull(args: string[], io: ShareIO): Promise<number> {
  try {
    return await pull(args, io);
  } catch (error) {
    if (!(error instanceof ShareError)) throw error;

    io.stderr.write(`[frogbot] ${error.message}\n`);

    return error.code;
  }
}

async function pull(args: string[], io: ShareIO): Promise<number> {
  const [name] = args;

  if (args.length !== 1 || !name || name.startsWith('-')) throw new ShareError(usage, 2);

  const dojo = createDojo(io);

  await dojo.signIn();

  const looked = await dojo.request(`/api/apps/${encodeURIComponent(name)}`);

  if (!looked.ok) throw new ShareError(await dojoMessage(looked));

  const app = (await looked.json()) as Partial<App>;

  if (
    (typeof app.id !== 'string' && typeof app.id !== 'number') ||
    typeof app.slug !== 'string' ||
    !slugPattern.test(app.slug)
  ) {
    throw new ShareError("Couldn't read the app: Dojo sent no id or slug.");
  }

  const { id, slug } = app as App;
  const dest = resolve(io.cwd, slug);

  if (await exists(dest)) {
    throw new ShareError(`./${slug} already exists; pull somewhere else or remove it.`);
  }

  const source = await dojo.request(`/api/apps/${encodeURIComponent(String(id))}/source`, () => ({
    headers: { accept: 'application/gzip' },
  }));

  if (!source.ok || !source.body) throw new ShareError(await dojoMessage(source));

  const staging = await mkdtemp(join(io.cwd, '.frogbot-pull-'));

  try {
    await pipeline(
      Readable.fromWeb(source.body as ReadableStream<Uint8Array>),
      x({
        cwd: staging,
        strict: true,
        filter: (_, entry) =>
          'type' in entry && (entry.type === 'File' || entry.type === 'Directory'),
      }),
    ).catch((error: unknown) => {
      throw new ShareError(`Couldn't unpack the app's source: ${(error as Error).message}`);
    });

    await writeLink(staging, { appId: id });

    await writeFile(
      join(staging, '.env'),
      `DATABASE_URL=file:./frogbot.db\nFROGBOT_SECRET=${randomBytes(24).toString('hex')}\n`,
    );

    await rename(staging, dest);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  say(
    io,
    `[frogbot] Pulled ${slug} into ./${slug}. It starts with an empty database; production keys stay on Dojo.`,
  );

  say(io, `cd ${slug}`);
  say(io, 'pnpm install');
  say(io, 'pnpm dev');

  return 0;
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch {
    return false;
  }
}
