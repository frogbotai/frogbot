import type { Verb } from '../command.js';
import { dojoJSON } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { findWorkspace } from '../workspaces.js';
import { findApp, whereEquals } from './resolve.js';

type Entry = {
  id: string | number;
  timestamp: string;
  event: string;
  actorLabel: string;
  app?: string | null;
  appName?: string | null;
  projectName?: string | null;
  detail?: unknown;
};

/** `activity`: who deployed, changed or invited what in a workspace, newest first. */
export const activity: Verb = {
  summary: "Show a workspace's activity log, newest first. Workspace admins, on Business.",
  flags: {
    workspace: {
      type: 'string',
      value: 'slug',
      help: 'The workspace. Needed when you are in more than one.',
    },
    app: { type: 'string', help: "Only this app's entries." },
    limit: { type: 'string', value: 'n', help: 'How many entries, 1 to 100. Default: 50.' },
  },
  run: async ({ io, dojo, values }) => {
    const limit = Number(values.limit ?? '50');

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ShareError('Give --limit as a whole number from 1 to 100.', 2);
    }

    const slug = typeof values.workspace === 'string' ? values.workspace : undefined;
    const app = typeof values.app === 'string' ? await findApp(dojo(), values.app) : undefined;
    const workspace = await findWorkspace({
      dojo: dojo(),
      io,
      slug,
      ...(app?.workspace !== undefined && {
        home: {
          id: app.workspace,
          refuse: (home) =>
            `${app.slug} is in ${home}, not ${slug}. Leave out --workspace, or use --workspace ${home}.`,
        },
      }),
    });

    const filter = app ? `&${whereEquals('app', app.id)}` : '';

    const { docs } = await dojoJSON<{ docs: Entry[] }>(
      dojo(),
      `/api/activity?depth=0&limit=${limit}&sort=-timestamp&${whereEquals('workspace', workspace.id)}${filter}`,
      {
        what: `Couldn't read the activity of ${workspace.slug}`,
        needs: 'an admin of the workspace on the Business plan',
      },
    );

    const entries = docs.map(
      ({ id, timestamp, event, actorLabel, appName, projectName, detail }) => ({
        id,
        at: timestamp,
        event,
        by: actorLabel,
        app: appName ?? null,
        project: projectName ?? null,
        detail: detail ?? null,
      }),
    );

    done(
      io,
      entries,
      entries.length
        ? entries.map(({ at, by, event, app: name, project }) =>
            [at, by, event, name ?? project].filter(Boolean).join('  '),
          )
        : [`[frogbot] No activity in ${workspace.slug} yet.`],
    );
  },
};
