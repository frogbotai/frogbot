import type { RawVerb, Verb } from '../command.js';
import type { DojoClient, DojoUser } from '../dojo.js';
import { ShareError } from '../error.js';
import type { DojoIO } from '../io.js';
import { done } from '../io.js';
import { listWorkspaces } from '../workspaces.js';

async function showMe(io: DojoIO, dojo: DojoClient, user: DojoUser): Promise<void> {
  const workspaces = (await listWorkspaces(dojo)).map(({ slug, name }) => ({ slug, name }));

  done(io, { email: user.email ?? null, url: dojo.url, workspaces }, [
    `[frogbot] Signed in to ${dojo.url} as ${user.email ?? 'an account with no email'}.`,
    ...workspaces.map(({ slug, name }) => `${slug}  ${name}`),
  ]);
}

/** `login`, `logout` and `whoami`. */
export const account: Record<string, Verb | RawVerb> = {
  login: {
    summary:
      'Sign in with a code you confirm in the browser. The first sign-in makes your account.',
    run: async ({ io, dojo }) => showMe(io, dojo(), await dojo().signIn()),
  },
  logout: {
    summary: 'Revoke and forget the stored sign-in.',
    raw: async (args, io) => (await import('../logout.js')).runLogout(args, io),
  },
  whoami: {
    summary: 'Show who is signed in, to which Dojo, and their workspaces.',
    run: async ({ io, dojo }) => {
      const user = await dojo().currentUser();

      if (!user && io.env.FROGBOT_DOJO_TOKEN) {
        throw new ShareError(`Dojo didn't accept FROGBOT_DOJO_TOKEN at ${dojo().url}.`);
      }

      if (!user) throw new ShareError(`Not signed in to ${dojo().url}. Run ${io.program} login.`);

      await showMe(io, dojo(), user);
    },
  },
};
