import type { DojoClient } from './dojo.js';
import { dojoList } from './dojo.js';
import { ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { say } from './io.js';

export type Workspace = { id: string | number; name: string; slug: string };

/** Every workspace the signed-in person is in. */
export async function listWorkspaces(dojo: DojoClient): Promise<Workspace[]> {
  return dojoList<Workspace>(dojo, '/api/workspaces?depth=0&limit=100', {
    what: "Couldn't list your workspaces",
  });
}

/**
 * The workspace a first share creates the app in: `slug`, the only one, or the person's pick. With none, says how to
 * make one and, with a TTY, reads them again when the person has.
 */
export async function chooseWorkspace({
  dojo,
  io,
  slug,
}: {
  dojo: DojoClient;
  io: DojoIO;
  slug?: string;
}): Promise<Workspace> {
  const create = `${dojo.url}/collections/workspaces/create`;

  for (let shown = false; ; shown = true) {
    const workspaces = await listWorkspaces(dojo);

    if (workspaces.length > 0) return pickWorkspace({ workspaces, slug, io });

    if (!io.isTTY) {
      throw new ShareError(
        `Your Dojo account has no workspace yet. Create one at ${create}, then rerun.`,
      );
    }

    if (!shown) {
      say(io, '[frogbot] Your Dojo account has no workspace yet. Create one here, then come back:');
      say(io, create);
      io.openBrowser(create);
    }

    if (!(await io.prompts.confirm('Created it? Check again'))) {
      throw new ShareError(`No workspace to share in. Create one at ${create}, then rerun.`);
    }
  }
}

/** The workspace `slug` names, or the only one; with several and no slug, the person's pick. */
export async function findWorkspace({
  dojo,
  io,
  slug,
}: {
  dojo: DojoClient;
  io: DojoIO;
  slug?: string;
}): Promise<Workspace> {
  const workspaces = await listWorkspaces(dojo);

  if (workspaces.length === 0) {
    throw new ShareError(
      `You have no workspace yet. Create one with ${io.program} workspaces create <name>.`,
    );
  }

  return pickWorkspace({ workspaces, slug, io });
}

async function pickWorkspace({
  workspaces,
  slug,
  io,
}: {
  workspaces: Workspace[];
  slug?: string;
  io: DojoIO;
}): Promise<Workspace> {
  const slugs = workspaces.map((workspace) => workspace.slug).join(', ');

  if (slug) {
    const chosen = workspaces.find((workspace) => workspace.slug === slug);

    if (!chosen) throw new ShareError(`No workspace "${slug}" in Dojo. Yours: ${slugs}.`);

    return chosen;
  }

  const [only] = workspaces;

  if (!only) throw new ShareError('No workspace to share in.');

  if (workspaces.length === 1) return only;

  if (!io.isTTY) {
    throw new ShareError(
      `Ask the person which workspace to use (${slugs}), then rerun with --workspace <slug>.`,
    );
  }

  const picked = await io.prompts.select(
    'Which workspace?',
    workspaces.map((workspace) => ({ value: workspace.slug, label: workspace.name })),
  );

  return workspaces.find((workspace) => workspace.slug === picked) ?? only;
}
