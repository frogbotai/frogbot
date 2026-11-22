import type { Noun, Verb, VerbFlag } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import type { DojoIO } from '../io.js';
import { dojoProgram, done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace, listWorkspaces } from '../workspaces.js';
import { count } from './resolve.js';

type Level = 'use' | 'editor' | 'owner';

type Details = {
  id: string;
  kind: 'app' | 'project';
  name: string;
  sender: string;
  fromWorkspace: string;
  email: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  recipient: boolean;
  workspaces: { id: string | number; name: string }[];
  toWorkspace: string | null;
  people: { email: string; level: Level }[];
  canRemove: boolean;
};

type Sent = { handover: { id: string; email: string; expiresAt: string }; sent: boolean };

const levels: Record<Level, string> = { use: 'Viewer', editor: 'Editor', owner: 'Admin' };

/** `--to <email>`, the person a handover goes to. */
export const toFlag: VerbFlag = {
  type: 'string',
  value: 'email',
  help: 'Who it goes to. Dojo emails them a link to accept it.',
};

/** `--workspace <slug>`, where a move or an accepted handover lands. */
export const intoFlag: VerbFlag = {
  type: 'string',
  value: 'slug',
  help: 'The workspace it moves into. You must be its Admin.',
};

/** The handover id in `ref`: the id itself, or the last path segment of the emailed link. */
export function handoverId(ref: string): string {
  const [path = ''] = ref.trim().split(/[?#]/);

  return path.split('/').filter(Boolean).at(-1) ?? '';
}

/** `--to`, required: a missing or blank one is refused before any request. */
export function recipient(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : '';

  if (!email) throw new ShareError('Name who it goes to with --to <email>.', 2);

  return email;
}

/** A move's refusal keeps Dojo's words and adds the page that pays for room when Dojo sent one. */
export async function withPayLink<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof ShareError) || !error.url) throw error;

    throw new ShareError(`${error.message} ${error.url}`, error.exitCode, {
      code: error.code,
      status: error.status,
      url: error.url,
    });
  }
}

/** Sends a handover of an app or project and prints it, with the command its sender cancels it with. */
export async function sendHandover({
  io,
  dojo,
  path,
  name,
  email,
  needs,
}: {
  io: DojoIO;
  dojo: DojoClient;
  path: string;
  name: string;
  email: string;
  needs: string;
}): Promise<void> {
  const { handover, sent } = await dojoJSON<Sent>(dojo, path, {
    method: 'POST',
    body: { email },
    what: `Dojo couldn't hand ${name} over`,
    needs,
  });

  done(io, { handover, sent }, [
    `[frogbot] Handover of ${name} to ${handover.email} waits until ${handover.expiresAt} (${handover.id}).`,
    ...(sent ? [] : [`Dojo couldn't email ${handover.email}; send them the id above.`]),
    `${dojoProgram(io.program)} handovers cancel ${handover.id} takes it back.`,
  ]);
}

async function readDetails(dojo: DojoClient, id: string): Promise<Details> {
  return dojoJSON<Details>(dojo, `/api/handovers/${segment(id)}/details`, {
    what: `Couldn't read the handover ${id}`,
  });
}

const subject = ({ kind, name }: Details) => (kind === 'app' ? name : `the project ${name}`);

async function acceptInto(
  dojo: DojoClient,
  io: DojoIO,
  details: Details,
  slug: string | undefined,
): Promise<Workspace> {
  if (slug) return findWorkspace({ dojo, io, slug });

  const yours = await listWorkspaces(dojo);
  const offered = yours.filter(({ id }) =>
    details.workspaces.some((choice) => String(choice.id) === String(id)),
  );

  const [only] = offered;

  if (!only) {
    throw new ShareError(
      `You admin no workspace that can take ${subject(details)}. Create one with ${dojoProgram(io.program)} workspaces create <name>, then rerun.`,
    );
  }

  if (offered.length === 1) return only;

  const slugs = offered.map((workspace) => workspace.slug).join(', ');

  if (!io.isTTY) {
    throw new ShareError(`Choose where it goes (${slugs}), then rerun with --workspace <slug>.`, 2);
  }

  const picked = await io.prompts.select(
    'Accept it into which workspace?',
    offered.map((workspace) => ({ value: workspace.slug, label: workspace.name })),
  );

  return offered.find((workspace) => workspace.slug === picked) ?? only;
}

const details: Verb = {
  summary: 'Show a handover: what it moves, who sent it, its state and who keeps access.',
  args: '<handover>',
  run: async ({ io, dojo, positionals: [ref = ''] }) => {
    const shown = await readDetails(dojo(), handoverId(ref));
    const into = shown.toWorkspace ? `, into ${shown.toWorkspace}` : '';

    done(io, shown, [
      `${shown.name}  ${shown.kind}  ${shown.status}${into}`,
      `From ${shown.sender} in ${shown.fromWorkspace} to ${shown.email}; open until ${shown.expiresAt}`,
      ...shown.people.map(({ email, level }) => `  ${email}  ${levels[level] ?? level}`),
      ...(shown.recipient && shown.status === 'pending'
        ? [
            `Accept with ${dojoProgram(io.program)} handovers accept ${shown.id}, or decline with handovers cancel.`,
          ]
        : []),
    ]);
  },
};

const accept: Verb = {
  summary:
    'Accept a handover sent to you. It moves into a workspace you admin, which pays for it from then on.',
  args: '<handover>',
  flags: { workspace: intoFlag },
  confirm: true,
  run: async ({ io, dojo, confirm, values, positionals: [ref = ''] }) => {
    const handover = await readDetails(dojo(), handoverId(ref));

    if (!handover.recipient) {
      throw new ShareError(
        `This handover was sent to ${handover.email}. Sign in as them to accept it.`,
      );
    }

    if (handover.status !== 'pending') {
      throw new ShareError(`This handover is ${handover.status}. Ask for a new one.`);
    }

    const slug =
      typeof values.workspace === 'string' ? values.workspace.trim() || undefined : undefined;

    const workspace = await acceptInto(dojo(), io, handover, slug);

    await confirm(
      `Accept ${subject(handover)} from ${handover.sender} into ${workspace.name} (${workspace.slug})? You become its Admin, and ${workspace.name} pays for it from then on.`,
    );

    const { moved } = await withPayLink(() =>
      dojoJSON<{ moved: (string | number)[] }>(
        dojo(),
        `/api/handovers/${segment(handover.id)}/accept`,
        {
          method: 'POST',
          body: { workspace: workspace.id },
          what: `Dojo couldn't accept ${subject(handover)}`,
          needs: 'Admin access to that workspace',
        },
      ),
    );

    done(io, { id: handover.id, workspace: workspace.slug, moved }, [
      `[frogbot] Accepted ${subject(handover)} into ${workspace.slug}: ${count(moved.length, 'app')} moved.`,
    ]);
  },
};

const cancel: Verb = {
  summary: 'Take back a handover you sent, or decline one sent to you, while it waits.',
  args: '<handover>',
  run: async ({ io, dojo, positionals: [ref = ''] }) => {
    const id = handoverId(ref);

    await dojoJSON<{ cancelled: boolean }>(dojo(), `/api/handovers/${segment(id)}/cancel`, {
      method: 'POST',
      what: `Dojo couldn't cancel the handover ${id}`,
    });

    done(io, { id, cancelled: true }, [`[frogbot] Cancelled the handover ${id}.`]);
  },
};

const removeAccess: Verb = {
  summary:
    "After a handover you accepted, remove everyone outside your workspace from what it moved. Your workspace's Admins only.",
  args: '<handover>',
  confirm: true,
  run: async ({ io, dojo, confirm, positionals: [ref = ''] }) => {
    const handover = await readDetails(dojo(), handoverId(ref));

    if (handover.status !== 'accepted') {
      throw new ShareError(
        `This handover is ${handover.status}. Access is removed only after it's accepted.`,
      );
    }

    if (handover.people.length === 0) {
      done(io, { id: handover.id, removed: 0 }, [
        `[frogbot] Nobody outside ${handover.toWorkspace ?? 'your workspace'} has access to ${subject(handover)}.`,
      ]);

      return;
    }

    await confirm(
      `Remove ${count(handover.people.length, 'person', 'people')} outside ${handover.toWorkspace ?? 'your workspace'} from ${subject(handover)}? ${handover.people.map(({ email }) => email).join(', ')}`,
    );

    const { removed } = await dojoJSON<{ removed: number }>(
      dojo(),
      `/api/handovers/${segment(handover.id)}/remove-access`,
      {
        method: 'POST',
        what: `Dojo couldn't remove access to ${subject(handover)}`,
        needs: 'Admin access to the workspace it moved into',
      },
    );

    done(io, { id: handover.id, removed }, [
      `[frogbot] Removed ${count(removed, 'person', 'people')} from ${subject(handover)}.`,
    ]);
  },
};

/** `handovers details | accept | cancel | remove-access`, by id or by the link Dojo emailed. */
export const handovers: Noun = {
  summary:
    'Read, accept, decline or cancel a handover of an app or project, by id or emailed link.',
  verbs: { details, accept, cancel, 'remove-access': removeAccess },
};
