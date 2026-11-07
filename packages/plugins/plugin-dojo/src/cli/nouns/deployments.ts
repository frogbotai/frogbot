import type { Noun } from '../command.js';
import { dojoJSON, followBuild } from '../dojo.js';
import { ShareError } from '../error.js';
import { done, say } from '../io.js';
import { findApp, whereEquals } from './resolve.js';

type Deployment = {
  id: string | number;
  status: string;
  runtimeStatus?: string | null;
  createdAt: string;
  finishedAt?: string | null;
  error?: string | null;
};

const editorNeeded = 'editor or owner access to the app';

/** `deployments list | logs`: an app's versions and their build logs. */
export const deployments: Noun = {
  summary: "List an app's deployments and read their build logs.",
  verbs: {
    list: {
      summary: "List an app's deployments, newest first.",
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);

        const { docs } = await dojoJSON<{ docs: Deployment[] }>(
          dojo(),
          `/api/deployments?depth=0&limit=20&sort=-createdAt&${whereEquals('project', app.id)}`,
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
            ? listed.map(
                ({ id, status, runtimeStatus, createdAt }) =>
                  `${id}  ${createdAt}  ${status}${runtimeStatus ? `/${runtimeStatus}` : ''}`,
              )
            : [`[frogbot] ${app.slug} has no deployments yet.`],
        );
      },
    },
    logs: {
      summary: "Print a deployment's build log, following it until the build ends.",
      args: '<id>',
      run: async ({ io, dojo, positionals: [id = ''] }) => {
        const lines: string[] = [];

        const build = await followBuild({
          dojo: dojo(),
          deploymentId: id,
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
  },
};
