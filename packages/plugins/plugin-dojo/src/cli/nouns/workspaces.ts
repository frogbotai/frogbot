import type { Noun } from '../command.js';
import { dojoJSON, segment } from '../dojo.js';
import { done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace, listWorkspaces } from '../workspaces.js';

type DocReply = { doc: Workspace };

/** `workspaces list | create | rename`. Dojo has no workspace delete. */
export const workspaces: Noun = {
  summary: 'List, create and rename your workspaces.',
  verbs: {
    list: {
      summary: 'List the workspaces you are in.',
      run: async ({ io, dojo }) => {
        const docs = await listWorkspaces(dojo());
        const listed = docs.map(({ id, slug, name }) => ({ id, slug, name }));

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
  },
};
