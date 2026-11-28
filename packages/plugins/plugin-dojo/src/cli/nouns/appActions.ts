import { lstat, open, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import type { Verb } from '../command.js';
import { formatBytes } from '../data/upload.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, segment } from '../dojo.js';
import { dojoStop, ShareError } from '../error.js';
import { dojoProgram, done } from '../io.js';
import { waitForPayment, whenPaid } from '../payment.js';
import { count, findApp } from './resolve.js';

const adminNeeded = 'owner access to the app';
const editorNeeded = 'editor or owner access to the app';

/** A dollar amount as Dojo's pages show it: `$3.20`. */
export const dollars = (amount: number) => `$${amount.toFixed(2)}`;

type Stopped = { stopped: boolean; stoppedAt: string | null };

function lifecycle(
  action: 'restart' | 'stop' | 'start',
  summary: string,
  line: (slug: string, reply: Stopped & { restarted?: boolean }) => string,
): Verb {
  return {
    summary,
    args: '[app]',
    ...(action === 'stop' && {
      confirm: ({ positionals: [ref = ''] }) =>
        `Stop ${ref}? Visitors see a paused page until you start it again.`,
    }),
    run: async ({ io, dojo, positionals: [ref = ''] }) => {
      const app = await findApp(dojo(), ref);
      const reply = await dojoJSON<Stopped & { restarted?: boolean }>(
        dojo(),
        `/api/apps/${segment(app.id)}/${action}`,
        { method: 'POST', what: `Dojo couldn't ${action} ${app.slug}`, needs: adminNeeded },
      );

      done(io, { app: app.slug, ...reply }, [`[frogbot] ${line(app.slug, reply)}`]);
    },
  };
}

type Preview = {
  state: 'live' | 'ended';
  endsAt: string;
  keep: boolean;
} | null;

type Usage = {
  month: string;
  spentUSD: number;
  models: { model: string; requests: number; costUSD: number }[];
  workspace: string;
  metered: boolean;
  balanceUSD: number | null;
  paused: boolean;
};

type TrashedApp = {
  id: string | number;
  name: string;
  slug: string;
  workspace: string;
  deletedAt: string;
  purgeAt: string;
};

async function listTrash(dojo: DojoClient): Promise<TrashedApp[]> {
  const { apps } = await dojoJSON<{ apps: TrashedApp[] }>(dojo, '/api/trash', {
    what: "Couldn't list your Trash",
  });

  return apps;
}

async function download(response: Response, path: string): Promise<number> {
  const file = await open(path, 'wx', 0o600).catch((error: Error) => {
    throw new ShareError(`Couldn't create ${path}: ${error.message}`);
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      file.createWriteStream(),
    );
  } catch (error) {
    await rm(path, { force: true });

    throw new ShareError(`The data download stopped: ${(error as Error).message}`);
  }

  return (await lstat(path)).size;
}

/** `apps` verbs beyond the basics: run, stop and keep an app, read its AI spend, Trash and data. */
export const appActions: Record<string, Verb> = {
  restart: lifecycle(
    'restart',
    'Restart an app on its current version and keys.',
    (slug) => `Restarted ${slug}.`,
  ),
  stop: lifecycle(
    'stop',
    'Stop an app: visitors get a paused page. It keeps its address, data and paid app.',
    (slug) => `Stopped ${slug}. Start it again with apps start ${slug}.`,
  ),
  start: lifecycle('start', 'Start a stopped app.', (slug) => `Started ${slug}.`),
  keep: {
    summary: 'Keep a free preview as a paid app, or print the link that pays for one.',
    args: '[app]',
    run: async ({ io, dojo, positionals: [ref = ''] }) => {
      const app = await findApp(dojo(), ref);
      const { preview, url } = await dojoJSON<{ preview: Preview; url: string | null }>(
        dojo(),
        `/api/apps/${segment(app.id)}/preview/keep`,
        { method: 'POST', what: `Dojo couldn't keep ${app.slug}`, needs: editorNeeded },
      );

      const paid = url
        ? await waitForPayment(dojo(), io, {
            link: url,
            why: `Keeping ${app.slug} needs one more paid app.`,
            then: `and ${app.slug} becomes a paid app`,
            owner: app.level !== 'editor',
          })
        : true;

      done(io, { app: app.slug, kept: true, paid, url, preview }, [
        paid
          ? `[frogbot] Kept ${app.slug}. It's a paid app now.`
          : `[frogbot] Kept ${app.slug}. It becomes a paid app once that's paid.`,
      ]);
    },
  },
  usage: {
    summary: "Show an app's AI spend this month and its workspace's AI balance.",
    args: '[app]',
    run: async ({ io, dojo, positionals: [ref = ''] }) => {
      const app = await findApp(dojo(), ref);
      const usage = await dojoJSON<Usage>(dojo(), `/api/apps/${segment(app.id)}/usage`, {
        what: `Couldn't read the usage of ${app.slug}`,
        needs: editorNeeded,
      });

      done(io, { app: app.slug, ...usage }, [
        `${app.slug}: ${dollars(usage.spentUSD)} of AI in ${usage.month}`,
        ...usage.models.map(
          ({ model, requests, costUSD }) =>
            `  ${model}  ${count(requests, 'request')}  ${dollars(costUSD)}`,
        ),
        ...(usage.metered && usage.balanceUSD !== null
          ? [
              `Workspace AI balance: ${dollars(usage.balanceUSD)}${usage.paused ? '. AI is paused until funds are added.' : ''}`,
            ]
          : []),
      ]);
    },
  },
  trash: {
    summary: 'List your apps in Trash, with when each is deleted for good.',
    run: async ({ io, dojo }) => {
      const apps = await listTrash(dojo());

      done(
        io,
        apps,
        apps.length
          ? apps.map(({ slug, purgeAt }) => `${slug}  deleted for good ${purgeAt}`)
          : ['[frogbot] Your Trash is empty.'],
      );
    },
  },
  restore: {
    summary: 'Restore an app from Trash.',
    args: '[app]',
    run: async ({ io, dojo, positionals: [ref = ''] }) => {
      const apps = await listTrash(dojo());
      const app =
        apps.find(({ slug }) => slug === ref) ?? apps.find(({ id }) => String(id) === ref);

      if (!app) {
        throw new ShareError(
          `"${ref}" isn't in your Trash. ${dojoProgram(io.program)} apps trash lists it.`,
        );
      }

      const response = await whenPaid(dojo(), io, () =>
        dojo().request(`/api/apps/${segment(app.id)}/restore`, () => ({ method: 'POST' })),
      );

      if (!response.ok) {
        throw await dojoStop(
          response,
          `Dojo couldn't restore ${app.slug}`,
          response.status === 403 ? ` It needs ${adminNeeded}.` : '',
        );
      }

      done(io, { restored: { id: app.id, slug: app.slug } }, [`[frogbot] Restored ${app.slug}.`]);
    },
  },
  'export-data': {
    summary: "Download an app's live database and uploaded files as a .zip.",
    args: '[app]',
    flags: {
      out: { type: 'string', value: 'file', help: 'Where to save it. Default: ./<app>-data.zip.' },
    },
    run: async ({ io, dojo, positionals: [ref = ''], values }) => {
      const app = await findApp(dojo(), ref);
      const out = resolve(
        io.cwd,
        typeof values.out === 'string' ? values.out : `${app.slug}-data.zip`,
      );

      if (await lstat(out).catch(() => undefined)) {
        throw new ShareError(`${out} already exists. Choose another file with --out.`);
      }

      const response = await dojo().request(`/api/apps/${segment(app.id)}/data`, () => ({
        headers: { accept: 'application/zip' },
      }));

      if (!response.ok || !response.body) {
        throw await dojoStop(
          response,
          `Couldn't download the data of ${app.slug}`,
          response.status === 403 ? ` It needs ${adminNeeded}.` : '',
        );
      }

      const bytes = await download(response, out);

      done(io, { app: app.slug, path: out, bytes }, [
        `[frogbot] Saved the data of ${app.slug} to ${out} (${formatBytes(bytes)}).`,
      ]);
    },
  },
};
