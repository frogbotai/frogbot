import type { Noun } from '../command.js';
import { dojoJSON, followBuild, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { dojoProgram, done, say } from '../io.js';
import { findApp, relationId, whereEquals } from './resolve.js';

type Deployment = {
  id: string | number;
  status: string;
  runtimeStatus?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  error?: string | null;
  runtimeError?: string | null;
  liveAt?: string | null;
  trigger?: string | null;
  commit?: string | null;
  branch?: string | null;
};

const pageSize = 20;

function pageNumber(value: unknown): number {
  if (value === undefined) return 1;

  const page = Number(value);

  if (typeof value !== 'string' || !/^\d+$/.test(value) || page < 1) {
    throw new ShareError(`--page needs a page number from 1 up, not "${String(value)}".`, 2);
  }

  return page;
}

const failed = ({ status, runtimeStatus }: Deployment) =>
  status === 'failed' || runtimeStatus === 'failed';

const editorNeeded = 'editor or owner access to the app';

/**
 * `deployments list | get | logs | rollback | cancel`: an app's versions, one version's status, their build logs,
 * going back and stopping a build.
 */
export const deployments: Noun = {
  summary:
    "List an app's deployments, check one, read their build logs, roll back or cancel a build.",
  verbs: {
    list: {
      summary: `List an app's deployments, newest first, ${pageSize} a page.`,
      args: '<app>',
      flags: {
        page: { type: 'string', value: 'n', help: 'Show this page of older deployments.' },
      },
      run: async ({ io, dojo, positionals: [ref = ''], values }) => {
        const page = pageNumber(values.page);
        const app = await findApp(dojo(), ref);

        const { docs, totalPages = 1 } = await dojoJSON<{
          docs: Deployment[];
          totalPages?: number;
        }>(
          dojo(),
          `/api/deployments?depth=0&limit=${pageSize}&page=${page}&sort=-createdAt&${whereEquals('app', app.id)}`,
          { what: `Couldn't list the deployments of ${app.slug}`, needs: editorNeeded },
        );

        const listed = docs.map(({ id, status, runtimeStatus, createdAt, finishedAt, error }) => ({
          id,
          status,
          runtimeStatus: runtimeStatus ?? null,
          createdAt,
          finishedAt: finishedAt ?? null,
          error: error ?? null,
        }));

        done(
          io,
          listed,
          listed.length
            ? [
                ...listed.map(
                  ({ id, status, runtimeStatus, createdAt }) =>
                    `${id}  ${createdAt}  ${status}${runtimeStatus ? `/${runtimeStatus}` : ''}`,
                ),
                ...(page < totalPages
                  ? [
                      `[frogbot] Page ${page} of ${totalPages}. Add --page ${page + 1} for older ones.`,
                    ]
                  : []),
              ]
            : [
                page > 1
                  ? `[frogbot] ${app.slug} has no deployments on page ${page}.`
                  : `[frogbot] ${app.slug} has no deployments yet.`,
              ],
        );
      },
    },
    get: {
      summary: "Show one deployment's status. Exits 1 when its build failed or it didn't start.",
      args: '<id>',
      run: async ({ io, dojo, positionals: [id = ''] }) => {
        const reply = await dojoJSON<
          Omit<Deployment, 'id' | 'status'> &
            Partial<Pick<Deployment, 'id' | 'status'>> & { app?: unknown }
        >(dojo(), `/api/deployments/${segment(id)}?depth=0`, {
          what: `Couldn't read deployment ${id}`,
          needs: editorNeeded,
        });

        if (reply.id === undefined || !reply.status) throw new ShareError(`No deployment ${id}.`);

        const deployment = { ...reply, id: reply.id, status: reply.status };

        const shown = {
          id: deployment.id,
          app: relationId(deployment.app) ?? null,
          status: deployment.status,
          runtimeStatus: deployment.runtimeStatus ?? null,
          failed: failed(deployment),
          trigger: deployment.trigger ?? null,
          commit: deployment.commit ?? null,
          branch: deployment.branch ?? null,
          createdAt: deployment.createdAt,
          finishedAt: deployment.finishedAt ?? null,
          liveAt: deployment.liveAt ?? null,
          error: deployment.error ?? null,
          runtimeError: deployment.runtimeError ?? null,
        };

        const problem = shown.error ?? shown.runtimeError;
        const running = shown.status === 'queued' || shown.status === 'building';

        done(io, shown, [
          `${shown.id}  ${shown.status}${shown.runtimeStatus ? `/${shown.runtimeStatus}` : ''}`,
          `Started ${shown.createdAt}${shown.finishedAt ? `, finished ${shown.finishedAt}` : ''}${shown.liveAt ? `, live ${shown.liveAt}` : ''}`,
          ...(shown.commit
            ? [`From ${shown.commit.slice(0, 7)}${shown.branch ? ` on ${shown.branch}` : ''}`]
            : []),
          ...(problem ? [`[frogbot] ${problem}`] : []),
          ...(running
            ? [
                `${dojoProgram(io.program)} deployments logs ${shown.id} --follow watches the build.`,
              ]
            : []),
        ]);

        return shown.failed ? 1 : 0;
      },
    },
    logs: {
      summary: "Print the end of a deployment's build log, or follow it until the build ends.",
      args: '<id>',
      flags: { follow: { type: 'boolean', help: 'Stream new lines until the build ends.' } },
      run: async ({ io, dojo, positionals: [id = ''], values }) => {
        if (values.follow !== true) {
          const deployment = await dojoJSON<Deployment & { logTail?: unknown }>(
            dojo(),
            `/api/deployments/${segment(id)}?depth=0`,
            { what: `Couldn't read deployment ${id}`, needs: editorNeeded },
          );

          const lines = Array.isArray(deployment.logTail) ? deployment.logTail.map(String) : [];
          const running = deployment.status === 'queued' || deployment.status === 'building';

          done(io, { id, status: deployment.status, error: deployment.error ?? null, lines }, [
            ...lines,
            `[frogbot] ${deployment.status}${deployment.error ? `: ${deployment.error}` : ''}`,
            ...(running ? ['Add --follow to watch the build.'] : []),
          ]);

          return;
        }

        const lines: string[] = [];

        const build = await followBuild({
          dojo: dojo(),
          deploymentId: id,
          program: io.program,
          onLine: (line) => {
            lines.push(line);

            if (!io.json) say(io, line);
          },
        });

        done(io, {
          id,
          status: build.status,
          error: build.error ?? null,
          url: build.url ?? null,
          lines,
        });

        if (build.status === 'failed') {
          throw new ShareError(`Build failed: ${build.error || 'see the log above'}`);
        }
      },
    },
    rollback: {
      summary: "Put an earlier live version back, keeping today's data and keys.",
      args: '<app> <id>',
      run: async ({ io, dojo, positionals: [ref = '', id = ''] }) => {
        const app = await findApp(dojo(), ref);
        const { deploymentId } = await dojoJSON<{ deploymentId: string | number }>(
          dojo(),
          `/api/apps/${segment(app.id)}/deployments/${segment(id)}/rollback`,
          { method: 'POST', what: `Dojo couldn't roll ${app.slug} back`, needs: editorNeeded },
        );

        done(io, { app: app.slug, rolledBackTo: id, deploymentId }, [
          `[frogbot] Rolling ${app.slug} back to ${id} as deployment ${deploymentId}. If it can't start, the current version keeps running.`,
          `${dojoProgram(io.program)} deployments list ${app.slug} shows when it's live.`,
        ]);
      },
    },
    cancel: {
      summary: 'Cancel a queued or building deployment. The app stays as it was.',
      args: '<id>',
      run: async ({ io, dojo, positionals: [id = ''] }) => {
        const { status, finishedAt } = await dojoJSON<{ status: string; finishedAt: string }>(
          dojo(),
          `/api/deployments/${segment(id)}/cancel`,
          {
            method: 'POST',
            what: `Dojo couldn't cancel deployment ${id}`,
            needs: 'owner access to the app',
          },
        );

        done(io, { id, status, finishedAt }, [`[frogbot] Cancelled deployment ${id}.`]);
      },
    },
  },
};
