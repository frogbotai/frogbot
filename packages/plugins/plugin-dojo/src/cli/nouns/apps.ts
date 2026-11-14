import { nameTaken, toSlug } from '../appSlug.js';
import type { Noun } from '../command.js';
import { dojoJSON, dojoList, segment } from '../dojo.js';
import { dojoError, dojoStop, ShareError } from '../error.js';
import { done } from '../io.js';
import { whenPaid } from '../payment.js';
import { findWorkspace } from '../workspaces.js';
import { appAddress, findApp, whereEquals } from './resolve.js';

type App = {
  id: string | number;
  name: string;
  slug: string;
  workspace: string | number | { id: string | number };
  domain?: string | null;
  startedAt?: string | null;
};

const ownerNeeded = 'owner access to the app';

const shown = ({ id, name, slug, workspace, domain, startedAt }: App) => ({
  id,
  name,
  slug,
  workspace: typeof workspace === 'object' ? workspace.id : workspace,
  url: appAddress(slug),
  domain: domain ?? null,
  started: Boolean(startedAt),
});

/** `apps`: pull and logs, and list, get, create, rename, delete. `frogbot deploy` ships an app. */
export const apps: Noun = {
  summary: 'Pull, read logs of, and manage your apps.',
  verbs: {
    pull: {
      summary: "Download an app's live source into a new folder.",
      args: '<app>',
      raw: async (args, io) => (await import('../pull.js')).runPull(args, io),
    },
    logs: {
      summary: "Print an app's runtime logs.",
      args: '<app>',
      flags: { follow: { type: 'boolean', help: 'Keep printing new lines. Not with --json.' } },
      raw: async (args, io) => (await import('../logs.js')).runLogs(args, io),
    },
    list: {
      summary: 'List the apps you can see.',
      flags: { workspace: { type: 'string', value: 'slug', help: 'Only apps in this workspace.' } },
      run: async ({ io, dojo, values }) => {
        const slug = typeof values.workspace === 'string' ? values.workspace : undefined;
        const workspace = slug ? await findWorkspace({ dojo: dojo(), io, slug }) : undefined;
        const filter = workspace ? `&${whereEquals('workspace', workspace.id)}` : '';

        const docs = await dojoList<App>(dojo(), `/api/apps?depth=0&limit=100&sort=name${filter}`, {
          what: "Couldn't list your apps",
        });

        const listed = docs.map(shown);

        done(
          io,
          listed,
          listed.map(({ slug: app, url }) => `${app}  ${url}`),
        );
      },
    },
    get: {
      summary: "Show an app's address, whether it has started, and your access.",
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);
        const shownApp = { ...app, url: appAddress(app.slug) };

        done(io, shownApp, [
          `${app.slug}  ${shownApp.url}`,
          `Started: ${app.started ? 'yes' : 'not yet'}`,
          ...(app.level ? [`Your access: ${app.level}`] : []),
        ]);
      },
    },
    create: {
      summary: 'Create an empty app to deploy to later.',
      args: '<name>',
      flags: {
        workspace: { type: 'string', value: 'slug', help: 'Needed when you are in more than one.' },
      },
      run: async ({ io, dojo, positionals: [name = ''], values }) => {
        const appSlug = toSlug(name);
        const slug = typeof values.workspace === 'string' ? values.workspace : undefined;
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });

        const created = await whenPaid(dojo(), io, () =>
          dojo().request('/api/apps?depth=0', () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, slug: appSlug, workspace: workspace.id }),
          })),
        );

        if (!created.ok) {
          const stop = await dojoStop(created.clone(), "Dojo couldn't create the app");

          if (nameTaken(created.status, (await dojoError(created)).body)) {
            throw new ShareError(`The name "${appSlug}" is taken on Dojo. Choose another.`);
          }

          throw stop;
        }

        const { doc } = (await created.json()) as { doc: App };

        done(io, shown(doc), [`[frogbot] Created ${doc.slug} in ${workspace.name}.`]);
      },
    },
    rename: {
      summary: 'Rename an app. Its slug and address stay.',
      args: '<app> <name>',
      run: async ({ io, dojo, positionals: [ref = '', name = ''] }) => {
        const app = await findApp(dojo(), ref);

        const { doc } = await dojoJSON<{ doc: App }>(
          dojo(),
          `/api/apps/${segment(app.id)}?depth=0`,
          {
            method: 'PATCH',
            body: { name },
            what: "Dojo couldn't rename the app",
            needs: ownerNeeded,
          },
        );

        done(io, shown(doc), [`[frogbot] Renamed ${doc.slug} to ${doc.name}.`]);
      },
    },
    delete: {
      summary: 'Delete an app, its versions and its data.',
      args: '<app>',
      confirm: true,
      run: async ({ io, dojo, confirm, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);

        await confirm(`Delete ${app.slug} and everything in it? This can't be undone.`);

        await dojoJSON(dojo(), `/api/apps/${segment(app.id)}`, {
          method: 'DELETE',
          what: "Dojo couldn't delete the app",
          needs: ownerNeeded,
        });

        done(io, { deleted: { id: app.id, slug: app.slug } }, [`[frogbot] Deleted ${app.slug}.`]);
      },
    },
  },
};
