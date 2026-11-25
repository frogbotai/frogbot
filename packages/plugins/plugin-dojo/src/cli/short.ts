import type { RawVerb, Verb } from './command.js';
import { linkedApp } from './command.js';
import type { DojoClient } from './dojo.js';
import { dojoJSON, segment } from './dojo.js';
import { ShareError } from './error.js';
import { dojoProgram, done } from './io.js';
import { appAddress, whereEquals } from './nouns/resolve.js';

type LiveApp = {
  id: string | number;
  slug: string;
  url?: string;
  status?: string;
  deployment?: string | number | null;
  started?: boolean;
};

type Deploy = {
  id: string | number;
  status: string;
  runtimeStatus?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  liveAt?: string | null;
  error?: string | null;
  runtimeError?: string | null;
};

const editorNeeded = 'editor or owner access to the app';

async function readApp(dojo: DojoClient, ref: string): Promise<LiveApp & { url: string }> {
  const app = await dojoJSON<Partial<LiveApp>>(dojo, `/api/apps/${segment(ref)}/cli`, {
    what: `Couldn't find the app "${ref}"`,
    needs: editorNeeded,
  });

  if ((typeof app.id !== 'string' && typeof app.id !== 'number') || typeof app.slug !== 'string') {
    throw new ShareError("Couldn't read the app: Dojo sent no id or slug.");
  }

  return { ...app, id: app.id, slug: app.slug, url: app.url ?? appAddress(app.slug) };
}

async function recentDeploys(dojo: DojoClient, app: LiveApp, limit: number): Promise<Deploy[]> {
  const { docs } = await dojoJSON<{ docs: Deploy[] }>(
    dojo,
    `/api/deployments?depth=0&limit=${limit}&sort=-createdAt&${whereEquals('app', app.id)}&where[status][not_equals]=cancelled`,
    { what: `Couldn't read the deployments of ${app.slug}`, needs: editorNeeded },
  );

  return docs;
}

const failed = ({ status, runtimeStatus }: Deploy) =>
  status === 'failed' || runtimeStatus === 'failed';

const logs: RawVerb = {
  summary: "Print the app's logs: the runtime log, or the build log when the last deploy failed.",
  args: '[app]',
  flags: { follow: { type: 'boolean', help: 'Keep printing new lines. Not with --json.' } },
  raw: async (args, io) => (await import('./logs.js')).runLogs(args, io, { build: true }),
};

const status: Verb = {
  summary: "Show the app's address, whether it's running, and its last deploy.",
  args: '[app]',
  run: async ({ io, dojo, positionals: [ref = ''] }) => {
    const app = await readApp(dojo(), ref);
    const [last] = await recentDeploys(dojo(), app, 1);
    const state = app.status ?? (app.started ? 'live' : 'not_deployed');

    const shown = {
      app: app.slug,
      url: app.url,
      status: state,
      running: state === 'live',
      liveDeployment: app.deployment ?? null,
      lastDeploy: last
        ? {
            id: last.id,
            status: last.status,
            runtimeStatus: last.runtimeStatus ?? null,
            failed: failed(last),
            createdAt: last.createdAt,
            finishedAt: last.finishedAt ?? null,
            error: last.error ?? last.runtimeError ?? null,
          }
        : null,
    };

    const deploy = shown.lastDeploy;
    const program = dojoProgram(io.program);

    done(io, shown, [
      `${app.slug}  ${app.url}`,
      `Status: ${state.replace('_', ' ')}`,
      deploy
        ? `Last deploy: ${deploy.id}  ${deploy.status}${deploy.runtimeStatus ? `/${deploy.runtimeStatus}` : ''}  ${deploy.createdAt}`
        : 'Last deploy: none yet. frogbot deploy ships it.',
      ...(deploy?.error ? [`[frogbot] ${deploy.error}`] : []),
      ...(deploy?.failed ? [`${program} logs shows why.`] : []),
    ]);
  },
};

const open: Verb = {
  summary: "Print the app's live address, and open it when there's a terminal.",
  args: '[app]',
  run: async ({ io, dojo, positionals: [ref = ''] }) => {
    const app = await readApp(dojo(), ref);
    const opened = io.isTTY && !io.json;

    done(io, { app: app.slug, url: app.url, opened }, [app.url]);

    if (opened) io.openBrowser(app.url);
  },
};

const rollback: Verb = {
  summary:
    'Put back the newest version that went live before the current one, or the deployment you name.',
  args: '[id]',
  run: async ({ io, dojo, positionals: [id] }) => {
    const program = dojoProgram(io.program);
    const app = await readApp(dojo(), await linkedApp(io, `Usage: ${program} rollback [id]`));
    const target = id ?? (await previousLive(dojo(), app, program));

    const { deploymentId } = await dojoJSON<{ deploymentId: string | number }>(
      dojo(),
      `/api/apps/${segment(app.id)}/deployments/${segment(target)}/rollback`,
      { method: 'POST', what: `Dojo couldn't roll ${app.slug} back`, needs: editorNeeded },
    );

    done(io, { app: app.slug, rolledBackTo: target, deploymentId }, [
      `[frogbot] Rolling ${app.slug} back to ${target} as deployment ${deploymentId}. If it can't start, the current version keeps running.`,
      `${program} status shows when it's live.`,
    ]);
  },
};

async function previousLive(dojo: DojoClient, app: LiveApp, program: string): Promise<string> {
  const deploys = await recentDeploys(dojo, app, 50);
  const target = deploys.find(
    (deploy) => deploy.liveAt && String(deploy.id) !== String(app.deployment ?? ''),
  );

  if (!target) {
    throw new ShareError(
      `${app.slug} has no earlier live version to go back to. ${program} deployments list ${app.slug} shows its deployments.`,
      2,
    );
  }

  return String(target.id);
}

/** The daily commands, which act on the folder's app (`.frogbot/app.json`). */
export const daily: Record<string, Verb | RawVerb> = { logs, status, open, rollback };
