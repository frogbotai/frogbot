import { nameTaken, toSlug } from '../appSlug.js';
import type { Noun, Verb } from '../command.js';
import { dojoError, dojoJSON, dojoList, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { whenPaid } from '../payment.js';
import { findWorkspace } from '../workspaces.js';
import { appAddress, findApp, whereEquals } from './resolve.js';

type Project = {
  id: string | number;
  name: string;
  slug: string;
  workspace: string | number | { id: string | number };
  domain?: string | null;
  startedAt?: string | null;
};

const ownerNeeded = 'owner access to the app';

const shown = ({ id, name, slug, workspace, domain, startedAt }: Project) => ({
  id,
  name,
  slug,
  workspace: typeof workspace === 'object' ? workspace.id : workspace,
  url: appAddress(slug),
  domain: domain ?? null,
  started: Boolean(startedAt),
});

const share: Verb['flags'] = {
  data: { type: 'boolean', help: "Bring the app's local data, on the first share only." },
  'no-data': { type: 'boolean', help: 'Bring no data.' },
  workspace: {
    type: 'string',
    value: 'slug',
    help: 'The workspace a first share creates the app in.',
  },
  name: { type: 'string', help: "The app's name on Dojo, on the first share." },
  'no-keys': { type: 'boolean', help: 'Bring no keys from .env.' },
  'skip-key': { type: 'string', multiple: true, value: 'NAME', help: 'Leave one .env key out.' },
  yes: { type: 'boolean', help: 'Bring every key without asking.' },
  'update-keys': { type: 'boolean', help: 'Send local values for keys that differ from live.' },
};

/** `apps`: share, pull and logs from an app folder, and list, get, create, rename, delete. */
export const apps: Noun = {
  summary: 'Share, pull, read logs of, and manage your apps.',
  verbs: {
    share: {
      summary: "Share the app in this folder to Dojo, or update it once it's linked.",
      flags: share,
      raw: async (args, io) => (await import('../run.js')).runShare(args, io),
    },
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

        const docs = await dojoList<Project>(
          dojo(),
          `/api/projects?depth=0&limit=100&sort=name${filter}`,
          { what: "Couldn't list your apps" },
        );

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
      summary: 'Create an empty app to share to later.',
      args: '<name>',
      flags: {
        workspace: { type: 'string', value: 'slug', help: 'Needed when you are in more than one.' },
      },
      run: async ({ io, dojo, positionals: [name = ''], values }) => {
        const appSlug = toSlug(name);
        const slug = typeof values.workspace === 'string' ? values.workspace : undefined;
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });

        const created = await whenPaid(dojo(), io, () =>
          dojo().request('/api/projects?depth=0', () => ({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, slug: appSlug, workspace: workspace.id }),
          })),
        );

        if (!created.ok) {
          const { body, message } = await dojoError(created);

          if (nameTaken(created.status, body)) {
            throw new ShareError(`The name "${appSlug}" is taken on Dojo. Choose another.`);
          }

          throw new ShareError(`Dojo couldn't create the app: ${message}`);
        }

        const { doc } = (await created.json()) as { doc: Project };

        done(io, shown(doc), [`[frogbot] Created ${doc.slug} in ${workspace.name}.`]);
      },
    },
    rename: {
      summary: 'Rename an app. Its slug and address stay.',
      args: '<app> <name>',
      run: async ({ io, dojo, positionals: [ref = '', name = ''] }) => {
        const app = await findApp(dojo(), ref);

        const { doc } = await dojoJSON<{ doc: Project }>(
          dojo(),
          `/api/projects/${segment(app.id)}?depth=0`,
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

        await dojoJSON(dojo(), `/api/projects/${segment(app.id)}`, {
          method: 'DELETE',
          what: "Dojo couldn't delete the app",
          needs: ownerNeeded,
        });

        done(io, { deleted: { id: app.id, slug: app.slug } }, [`[frogbot] Deleted ${app.slug}.`]);
      },
    },
  },
};
