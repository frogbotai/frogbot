import { forgetSignIn, readToken } from './auth.js';
import { dojoUrl } from './dojo.js';
import { dojoStop, reachDojo, reportStop, ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { dojoProgram, done, say } from './io.js';

/**
 * Runs `frogbot dojo logout`: revokes the stored key in Dojo, keeping the keys it made, then forgets
 * it. Returns the exit code.
 */
export async function runLogout(args: string[], io: DojoIO): Promise<number> {
  try {
    return await logout(args, io);
  } catch (error) {
    return reportStop(io, error);
  }
}

async function logout(args: string[], io: DojoIO): Promise<number> {
  if (args.length > 0) throw new ShareError(`Usage: ${dojoProgram(io.program)} logout`, 2);

  const url = dojoUrl(io.env);
  const token = await readToken(io.env, url);

  if (io.env.FROGBOT_DOJO_TOKEN) {
    say(
      io,
      `[frogbot] FROGBOT_DOJO_TOKEN stays in use until you unset it. Revoke it with ${dojoProgram(io.program)} keys revoke <id>.`,
    );
  }

  if (!token) {
    await forgetSignIn(io.env, url);
    say(io, '[frogbot] Not signed in.');
    done(io, { url, signedOut: false });

    return 0;
  }

  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const me = await reachDojo(url, io.env, () => fetch(`${url}/api/users/me`, { headers }));

  if (!me.ok && me.status !== 401) {
    throw await dojoStop(me, "Couldn't sign out", ' Run logout again.');
  }

  const user = me.ok
    ? ((await me.json()) as { user?: { apiKeyId?: string | number } | null }).user
    : null;

  if (user?.apiKeyId !== undefined) {
    const revoked = await reachDojo(url, io.env, () =>
      fetch(`${url}/api/api-keys/${user.apiKeyId}/revoke`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ cascade: false }),
      }),
    );

    if (!revoked.ok && revoked.status !== 401 && revoked.status !== 404) {
      throw await dojoStop(revoked, "Couldn't revoke the key", ' Run logout again.');
    }
  }

  await forgetSignIn(io.env, url);
  say(io, `[frogbot] Signed out of ${url}.`);
  done(io, { url, signedOut: true });

  return 0;
}
