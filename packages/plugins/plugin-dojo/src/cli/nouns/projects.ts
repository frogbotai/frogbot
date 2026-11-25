import type { Noun, VerbFlag, VerbInput } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, dojoList, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { findWorkspace } from '../workspaces.js';
import { intoFlag, recipient, sendHandover, toFlag, withPayLink } from './handovers.js';
import { count, relationId, whereEquals } from './resolve.js';
import { namingPurge, purgeApps, purgeNotice, purgeTrashFlag, trashedApps } from './trash.js';

type Project = {
  id: string | number;
  name: string;
  workspace: unknown;
  isDefault?: boolean;
};

type Shown = { id: string | number; name: string; workspace?: string | number; isDefault: boolean };

type Danger = {
  name: string;
  canManage: boolean;
  canLeave: boolean;
  onlyAdmin: boolean;
  hasApps: boolean;
  workspace: { id: string | number; name: string };
  targets: { id: string | number; name: string }[];
  handover: { id: string; email: string; expiresAt: string } | null;
};

const adminNeeded = 'Admin access to the project or its workspace';

const workspaceFlag: VerbFlag = {
  type: 'string',
  value: 'slug',
  help: 'The workspace. Needed when you are in more than one.',
};

const inFlag: VerbFlag = {
  type: 'string',
  value: 'slug',
  help: 'Look the project name up in this workspace only.',
};

const shown = ({ id, name, workspace, isDefault }: Project): Shown => {
  const home = relationId(workspace);

  return {
    id,
    name,
    ...(home !== undefined && { workspace: home }),
    isDefault: isDefault === true,
  };
};

const line = ({ id, name, isDefault }: Shown) => `${id}  ${name}${isDefault ? '  (default)' : ''}`;

const slugOf = (values: VerbInput['values']) =>
  typeof values.workspace === 'string' ? values.workspace : undefined;

async function listProjects(dojo: DojoClient, workspace?: string | number): Promise<Project[]> {
  const filter = workspace === undefined ? '' : `&${whereEquals('workspace', workspace)}`;

  return dojoList<Project>(dojo, `/api/projects?depth=0&limit=100&sort=name${filter}`, {
    what: "Couldn't list your projects",
  });
}

/**
 * The project `ref` names: its id, or its name among the projects the person can see (in `workspace` when given,
 * named `label` in a refusal). A name two projects share is refused with their ids.
 */
export async function resolveProject({
  dojo,
  ref,
  workspace,
}: {
  dojo: DojoClient;
  ref: string;
  workspace?: { id: string | number; label: string };
}): Promise<Project> {
  const projects = await listProjects(dojo, workspace?.id);
  const byId = projects.find(({ id }) => String(id) === ref);

  if (byId) return byId;

  const named = projects.filter(
    ({ name }) => name.trim().toLowerCase() === ref.trim().toLowerCase(),
  );

  const [only] = named;

  if (named.length > 1) {
    throw new ShareError(
      `"${ref}" names ${named.length} projects (${named.map(({ id }) => id).join(', ')}). Name one by its id.`,
    );
  }

  if (!only) {
    const where = workspace ? ` in ${workspace.label}` : '';

    throw new ShareError(`No project "${ref}"${where}. projects list shows yours.`);
  }

  return only;
}

function movable(project: Project): Project {
  if (project.isDefault) {
    throw new ShareError("The workspace's default project can't move. Move its apps one by one.");
  }

  return project;
}

async function findProject({ io, dojo, positionals: [ref = ''], values }: VerbInput) {
  const slug = slugOf(values);
  const workspace = slug ? await findWorkspace({ dojo: dojo(), io, slug }) : undefined;

  return resolveProject({
    dojo: dojo(),
    ref,
    ...(workspace && { workspace: { id: workspace.id, label: workspace.slug } }),
  });
}

/** `projects list | create | rename | delete | danger | move | handover`: folders of apps inside a workspace. */
export const projects: Noun = {
  summary: "List, create, rename, delete, move and hand over a workspace's projects.",
  verbs: {
    list: {
      summary: 'List the projects you can see.',
      flags: { workspace: { ...workspaceFlag, help: 'Only projects in this workspace.' } },
      run: async ({ io, dojo, values }) => {
        const slug = slugOf(values);
        const workspace = slug ? await findWorkspace({ dojo: dojo(), io, slug }) : undefined;
        const listed = (await listProjects(dojo(), workspace?.id)).map(shown);

        done(io, listed, listed.map(line));
      },
    },
    create: {
      summary: 'Create a project. Dojo allows it on workspaces with Business features.',
      args: '<name>',
      flags: { workspace: workspaceFlag },
      run: async ({ io, dojo, values, positionals: [name = ''] }) => {
        const workspace = await findWorkspace({ dojo: dojo(), io, slug: slugOf(values) });

        const { doc } = await dojoJSON<{ doc: Project }>(dojo(), '/api/projects?depth=0', {
          method: 'POST',
          body: { workspace: workspace.id, name },
          what: `Dojo couldn't create the project in ${workspace.slug}`,
        });

        done(io, shown(doc), [`[frogbot] Created ${doc.name} (${doc.id}) in ${workspace.slug}.`]);
      },
    },
    rename: {
      summary: 'Rename a project.',
      args: '<project> <name>',
      flags: { workspace: inFlag },
      run: async (input) => {
        const project = await findProject(input);
        const [, name = ''] = input.positionals;

        const { doc } = await dojoJSON<{ doc: Project }>(
          input.dojo(),
          `/api/projects/${segment(project.id)}?depth=0`,
          {
            method: 'PATCH',
            body: { name },
            what: "Dojo couldn't rename the project",
            needs: adminNeeded,
          },
        );

        done(input.io, shown(doc), [`[frogbot] Renamed ${project.name} to ${doc.name}.`]);
      },
    },
    delete: {
      summary:
        'Delete an empty project for good. Dojo refuses while it holds apps; --purge-trash clears those in Trash.',
      args: '<project>',
      flags: { workspace: inFlag, 'purge-trash': purgeTrashFlag('project') },
      confirm: true,
      run: async (input) => {
        const project = await findProject(input);
        const purging = input.values['purge-trash'] === true;

        if (purging && project.isDefault) {
          throw new ShareError(
            `${project.name} is the workspace's default project, which Dojo never deletes, so nothing was deleted.`,
            2,
          );
        }

        const trashed = purging
          ? await trashedApps(input.dojo(), 'project', project.id, project.name)
          : [];

        await input.confirm(
          `Delete the project ${project.name} (${project.id}) for good?${purgeNotice(trashed)}`,
        );

        await purgeApps(input.dojo(), trashed);

        await namingPurge(purging ? trashed.map(({ slug: app }) => app) : undefined, () =>
          dojoJSON(input.dojo(), `/api/projects/${segment(project.id)}`, {
            method: 'DELETE',
            what: `Dojo couldn't delete ${project.name}`,
            needs: adminNeeded,
          }),
        );

        const purged = trashed.map(({ slug }) => slug);

        done(input.io, { deleted: shown(project), purged }, [
          ...(purged.length
            ? [`[frogbot] Deleted for good from Trash: ${purged.join(', ')}.`]
            : []),
          `[frogbot] Deleted the project ${project.name}.`,
        ]);
      },
    },
    danger: {
      summary: 'Show what you may do with a project: move, hand over, leave or delete it.',
      args: '<project>',
      flags: { workspace: inFlag },
      run: async (input) => {
        const project = await findProject(input);

        const danger = await dojoJSON<Danger>(
          input.dojo(),
          `/api/projects/${segment(project.id)}/danger`,
          { what: `Couldn't read what you may do with ${project.name}` },
        );

        const { canManage, canLeave, onlyAdmin, hasApps, targets, handover } = danger;

        done(input.io, { id: project.id, ...danger }, [
          `${danger.name}  in ${danger.workspace.name}`,
          `Move, hand over, delete: ${canManage ? 'yes' : `no, it needs ${adminNeeded}`}`,
          `Leave: ${canLeave && !onlyAdmin ? 'yes' : onlyAdmin ? "no, you're its last Admin" : 'no'}`,
          ...(hasApps ? ['Delete waits until it has no apps, Trash included.'] : []),
          ...(targets.length > 0
            ? [`Can move to: ${targets.map(({ name }) => name).join(', ')}`]
            : []),
          ...(handover
            ? [`Handover to ${handover.email} waits until ${handover.expiresAt} (${handover.id})`]
            : []),
        ]);
      },
    },
    move: {
      summary:
        'Move a project and its apps to another workspace you admin, at once. That workspace pays for them from then on.',
      args: '<project>',
      flags: { workspace: { ...intoFlag, help: `${intoFlag.help} Required.` } },
      confirm: true,
      run: async ({ io, dojo, confirm, values, positionals: [ref = ''] }) => {
        const slug = slugOf(values)?.trim();

        if (!slug) {
          throw new ShareError('Name the workspace it moves into with --workspace <slug>.', 2);
        }

        const project = movable(await resolveProject({ dojo: dojo(), ref }));
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });

        await confirm(
          `Move the project ${project.name} and its apps to ${workspace.name} (${workspace.slug}) now? They keep running at the same addresses; ${workspace.name} pays for them from then on.`,
        );

        const { moved } = await withPayLink(() =>
          dojoJSON<{ moved: (string | number)[] }>(
            dojo(),
            `/api/projects/${segment(project.id)}/move`,
            {
              method: 'POST',
              body: { workspace: workspace.id },
              what: `Dojo couldn't move ${project.name}`,
              needs: `${adminNeeded}, and Admin access to ${workspace.slug}`,
            },
          ),
        );

        done(io, { project: shown(project), workspace: workspace.slug, moved }, [
          `[frogbot] Moved the project ${project.name} and ${count(moved.length, 'app')} to ${workspace.slug}.`,
        ]);
      },
    },
    handover: {
      summary:
        'Hand a project and its apps to someone. Dojo emails them a link to accept it into a workspace they admin; it waits 7 days.',
      args: '<project>',
      flags: { to: toFlag, workspace: inFlag },
      confirm: true,
      run: async (input) => {
        const email = recipient(input.values.to);
        const project = movable(await findProject(input));

        await input.confirm(
          `Hand the project ${project.name} and its apps to ${email}? Once they accept, their workspace pays for them.`,
        );

        await sendHandover({
          io: input.io,
          dojo: input.dojo(),
          path: `/api/projects/${segment(project.id)}/handover`,
          name: `the project ${project.name}`,
          email,
          needs: adminNeeded,
        });
      },
    },
  },
};
