import type { Noun } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { dojoProgram, done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace, listWorkspaces } from '../workspaces.js';
import { findMember, listMembers } from './members.js';
import { namingPurge, purgeApps, purgeNotice, purgeTrashFlag, trashedApps } from './trash.js';

type DocReply = { doc: Workspace };

const shown = ({ id, slug, name }: Workspace) => ({ id, slug, name });

const ownerNeeded = "the workspace's Owner";

async function mustOwn(dojo: DojoClient, workspace: Workspace): Promise<void> {
  const user = await dojo.signIn();
  const member = (await listMembers(dojo, workspace)).find(
    (each) =>
      String(each.user ?? '') === String(user.id) ||
      (user.email !== undefined && each.email.toLowerCase() === user.email.toLowerCase()),
  );

  if (member?.role === 'owner') return;

  throw new ShareError(
    `Only ${workspace.slug}'s Owner can delete it, so nothing was deleted. ${member ? `You are ${member.role}.` : `You aren't a member of it.`}`,
    2,
  );
}

/** `workspaces list | create | rename | delete | owner`. */
export const workspaces: Noun = {
  summary: 'List, create, rename, delete and hand over your workspaces.',
  verbs: {
    list: {
      summary: 'List the workspaces you are in.',
      run: async ({ io, dojo }) => {
        const docs = await listWorkspaces(dojo());
        const listed = docs.map(shown);

        done(
          io,
          listed,
          listed.map(({ slug, name }) => `${slug}  ${name}`),
        );
      },
    },
    create: {
      summary: 'Create a workspace you own. Dojo picks its slug from the name.',
      args: '<name>',
      run: async ({ io, dojo, positionals: [name = ''] }) => {
        const { doc } = await dojoJSON<DocReply>(dojo(), '/api/workspaces?depth=0', {
          method: 'POST',
          body: { name },
          what: "Dojo couldn't create the workspace",
        });

        done(io, doc, [`[frogbot] Created ${doc.name} (${doc.slug}).`]);
      },
    },
    rename: {
      summary: 'Rename a workspace you own. Its slug stays.',
      args: '<slug> <name>',
      run: async ({ io, dojo, positionals: [slug = '', name = ''] }) => {
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });
        const { doc } = await dojoJSON<DocReply>(
          dojo(),
          `/api/workspaces/${segment(workspace.id)}?depth=0`,
          {
            method: 'PATCH',
            body: { name },
            what: "Dojo couldn't rename the workspace",
            needs: 'owner access to the workspace',
          },
        );

        done(io, doc, [`[frogbot] Renamed ${doc.slug} to ${doc.name}.`]);
      },
    },
    delete: {
      summary:
        'Delete an empty workspace for good, with its projects, members, keys and plan. Its Owner only.',
      args: '<slug>',
      flags: { 'purge-trash': purgeTrashFlag('workspace') },
      confirm: true,
      run: async ({ io, dojo, confirm, values, positionals: [slug = ''] }) => {
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });
        const purging = values['purge-trash'] === true;
        const program = dojoProgram(io.program);

        if (purging) await mustOwn(dojo(), workspace);

        const trashed = purging
          ? await trashedApps(dojo(), 'workspace', workspace.id, workspace.slug, program)
          : [];

        await confirm(
          `Delete ${workspace.name} (${workspace.slug}) for good? Its projects, members, API keys and plan go with it.${purgeNotice(trashed)}`,
        );

        await purgeApps(dojo(), trashed);

        await namingPurge(purging ? trashed.map(({ slug: app }) => app) : undefined, program, () =>
          dojoJSON<{ deleted: boolean }>(
            dojo(),
            `/api/workspaces/${segment(workspace.id)}/delete`,
            {
              method: 'POST',
              body: { name: workspace.name.trim() },
              what: `Dojo couldn't delete ${workspace.slug}`,
              needs: ownerNeeded,
            },
          ),
        );

        const purged = trashed.map(({ slug: app }) => app);

        done(io, { deleted: shown(workspace), purged }, [
          ...(purged.length
            ? [`[frogbot] Deleted for good from Trash: ${purged.join(', ')}.`]
            : []),
          `[frogbot] Deleted ${workspace.slug}.`,
        ]);
      },
    },
    owner: {
      summary:
        'Make a member the Owner at once. You become an Admin; the plan and card stay with the workspace.',
      args: '<slug> <email>',
      confirm: true,
      run: async ({ io, dojo, confirm, positionals: [slug = '', email = ''] }) => {
        const workspace = await findWorkspace({ dojo: dojo(), io, slug });
        const member = await findMember(dojo(), workspace, email);

        await confirm(
          `Make ${member.email} the Owner of ${workspace.slug}? You become an Admin, and only they can pay for, change the plan of or delete it.`,
        );

        const { owner, previous } = await dojoJSON<{
          owner: string | number;
          previous: string | number;
        }>(dojo(), `/api/workspaces/${segment(workspace.id)}/owner`, {
          method: 'POST',
          body: { memberId: member.id },
          what: `Dojo couldn't make ${member.email} the Owner`,
          needs: ownerNeeded,
        });

        done(io, { workspace: shown(workspace), owner, previous, email: member.email }, [
          `[frogbot] ${member.email} is now the Owner of ${workspace.slug}; you are an Admin.`,
        ]);
      },
    },
  },
};
