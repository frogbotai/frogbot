import type { Noun, VerbFlag, VerbInput } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, dojoList, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace } from '../workspaces.js';
import { whereEquals } from './resolve.js';

type Member = {
  id: string | number;
  email: string;
  role: 'owner' | 'member';
  user?: string | number | null;
};

const roles = ['owner', 'member'];

const workspaceFlag: VerbFlag = {
  type: 'string',
  value: 'slug',
  help: 'The workspace. Needed when you are in more than one.',
};

const ownerNeeded = 'owner access to the workspace';

function checkRole(role: string): Member['role'] {
  if (!roles.includes(role)) throw new ShareError(`Choose a role: ${roles.join(' or ')}.`, 2);

  return role as Member['role'];
}

async function inWorkspace({ io, dojo, values }: VerbInput): Promise<Workspace> {
  return findWorkspace({
    dojo: dojo(),
    io,
    slug: typeof values.workspace === 'string' ? values.workspace : undefined,
  });
}

async function listMembers(dojo: DojoClient, workspace: Workspace): Promise<Member[]> {
  return dojoList<Member>(
    dojo,
    `/api/members?depth=0&limit=100&sort=email&${whereEquals('workspace', workspace.id)}`,
    { what: `Couldn't list the members of ${workspace.slug}` },
  );
}

async function findMember(dojo: DojoClient, workspace: Workspace, email: string): Promise<Member> {
  const member = (await listMembers(dojo, workspace)).find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
  );

  if (!member) throw new ShareError(`${email} isn't a member of ${workspace.slug}.`);

  return member;
}

const shown = ({ id, email, role }: Member) => ({ id, email, role });

/** `members list | add | role | remove`, in `--workspace` or the only one. */
export const members: Noun = {
  summary: "Manage a workspace's members and their roles.",
  verbs: {
    list: {
      summary: 'List the members of a workspace.',
      flags: { workspace: workspaceFlag },
      run: async (input) => {
        const workspace = await inWorkspace(input);
        const listed = (await listMembers(input.dojo(), workspace)).map(shown);

        done(
          input.io,
          listed,
          listed.map(({ email, role }) => `${email}  ${role}`),
        );
      },
    },
    add: {
      summary: 'Add someone by email. They join when they sign in with it.',
      args: '<email>',
      flags: {
        role: { type: 'string', value: 'owner|member', help: 'Their role. Default member.' },
        workspace: workspaceFlag,
      },
      run: async (input) => {
        const [email = ''] = input.positionals;
        const role = checkRole(
          typeof input.values.role === 'string' ? input.values.role : 'member',
        );

        const workspace = await inWorkspace(input);

        const { doc } = await dojoJSON<{ doc: Member }>(input.dojo(), '/api/members?depth=0', {
          method: 'POST',
          body: { workspace: workspace.id, email, role },
          what: `Couldn't add ${email} to ${workspace.slug}`,
          needs: ownerNeeded,
        });

        done(input.io, shown(doc), [
          `[frogbot] Added ${doc.email} to ${workspace.slug} as ${role}.`,
        ]);
      },
    },
    role: {
      summary: "Change a member's role.",
      args: '<email> <role>',
      flags: { workspace: workspaceFlag },
      run: async (input) => {
        const [email = '', wanted = ''] = input.positionals;
        const role = checkRole(wanted);
        const workspace = await inWorkspace(input);
        const member = await findMember(input.dojo(), workspace, email);

        const { doc } = await dojoJSON<{ doc: Member }>(
          input.dojo(),
          `/api/members/${segment(member.id)}?depth=0`,
          {
            method: 'PATCH',
            body: { role },
            what: `Couldn't change ${email}'s role`,
            needs: ownerNeeded,
          },
        );

        done(input.io, shown(doc), [`[frogbot] ${doc.email} is now ${role} in ${workspace.slug}.`]);
      },
    },
    remove: {
      summary: 'Remove a member, or yourself, from a workspace.',
      args: '<email>',
      flags: { workspace: workspaceFlag },
      confirm: ({ positionals: [email] }) => `Remove ${email} from the workspace?`,
      run: async (input) => {
        const [email = ''] = input.positionals;
        const workspace = await inWorkspace(input);
        const member = await findMember(input.dojo(), workspace, email);

        await dojoJSON(input.dojo(), `/api/members/${segment(member.id)}`, {
          method: 'DELETE',
          what: `Couldn't remove ${email}`,
          needs: ownerNeeded,
        });

        done(input.io, { removed: shown(member) }, [
          `[frogbot] Removed ${member.email} from ${workspace.slug}.`,
        ]);
      },
    },
  },
};
