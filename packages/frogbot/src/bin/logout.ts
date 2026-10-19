import { readToken, removeToken } from './share/auth.js';
import { dojoMessage, dojoUrl } from './share/dojo.js';
import type { ShareIO } from './share/io.js';
import { processIO, say } from './share/io.js';

/** Runs `frogbot logout`: revokes the stored key in Dojo, then forgets it. Returns the exit code. */
export async function runLogout(args: string[], io: ShareIO): Promise<number> {
  if (args.length > 0) {
    io.stderr.write('[frogbot] Usage: frogbot logout\n');

    return 2;
  }

  const url = dojoUrl(io.env);
  const token = await readToken(io.env, url);

  if (!token) {
    say(io, '[frogbot] Not signed in.');

    return 0;
  }

  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  const me = await fetch(`${url}/api/users/me`, { headers });

  if (!me.ok && me.status !== 401) {
    io.stderr.write(`[frogbot] Couldn't sign out: ${await dojoMessage(me)} Run logout again.\n`);

    return 1;
  }

  const user = me.ok
    ? ((await me.json()) as { user?: { apiKeyId?: string | number } | null }).user
    : null;

  if (user?.apiKeyId !== undefined) {
    const revoked = await fetch(`${url}/api/api-keys/${user.apiKeyId}/revoke`, {
      method: 'POST',
      headers,
    });

    if (!revoked.ok && revoked.status !== 401 && revoked.status !== 404) {
      io.stderr.write(
        `[frogbot] Couldn't revoke the key: ${await dojoMessage(revoked)} Run logout again.\n`,
      );

      return 1;
    }
  }

  await removeToken(io.env, url);
  say(io, `[frogbot] Signed out of ${url}.`);

  return 0;
}

/** `frogbot logout`. */
export async function logout(args: string[]): Promise<void> {
  process.exitCode = await runLogout(args, processIO());
}
