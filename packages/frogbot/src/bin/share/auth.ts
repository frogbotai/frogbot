import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { ShareError } from './error.js';
import type { ShareEnv, ShareIO } from './io.js';
import { say } from './io.js';

type AuthFile = { tokens: Record<string, string> };

/** `$XDG_CONFIG_HOME/frogbotai/auth.json`, beside the gateway's config. */
export function authPath(env: ShareEnv): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'frogbotai', 'auth.json');
}

async function readAuth(env: ShareEnv): Promise<AuthFile> {
  try {
    const parsed = JSON.parse(await readFile(authPath(env), 'utf8')) as Partial<AuthFile>;

    return { tokens: { ...parsed.tokens } };
  } catch {
    return { tokens: {} };
  }
}

/** The stored token for this Dojo, if any. */
export async function readToken(env: ShareEnv, dojoUrl: string): Promise<string | undefined> {
  return (await readAuth(env)).tokens[dojoUrl];
}

/** Stores the token for this Dojo in an owner-only file. */
export async function writeToken(env: ShareEnv, dojoUrl: string, token: string): Promise<void> {
  const path = authPath(env);
  const auth = await readAuth(env);

  auth.tokens[dojoUrl] = token;

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Forgets this Dojo's token, and the file once no token is left. */
export async function removeToken(env: ShareEnv, dojoUrl: string): Promise<void> {
  const path = authPath(env);
  const auth = await readAuth(env);

  delete auth.tokens[dojoUrl];

  if (Object.keys(auth.tokens).length === 0) {
    await rm(path, { force: true });

    return;
  }

  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

const clientId = 'frogbot-cli';
const grantType = 'urn:ietf:params:oauth:grant-type:device_code';

async function post(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Signs in with Dojo's device flow (RFC 8628) and stores the token. */
export async function deviceLogin(io: ShareIO, dojoUrl: string): Promise<string> {
  const start = await post(`${dojoUrl}/api/cli/device/code`, {
    client_id: clientId,
    device_name: hostname(),
  });

  if (!start.ok) throw new ShareError(`Dojo refused the sign-in (${start.status}).`);

  const code = (await start.json()) as DeviceCode;
  const link = code.verification_uri_complete || code.verification_uri;

  say(io, '[frogbot] Sign in to Dojo: open this link and confirm the code.');
  say(io, link);
  say(io, code.user_code);

  if (io.isTTY) io.openBrowser(link);

  const deadline = Date.now() + code.expires_in * 1000;
  let interval = (code.interval ?? 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);

    const reply = await post(`${dojoUrl}/api/cli/device/token`, {
      grant_type: grantType,
      device_code: code.device_code,
      client_id: clientId,
    });

    const body = (await reply.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
    };

    if (reply.ok && body.access_token) {
      await writeToken(io.env, dojoUrl, body.access_token);
      say(io, '[frogbot] Signed in.');

      return body.access_token;
    }

    if (body.error === 'authorization_pending') continue;

    if (body.error === 'slow_down') {
      interval += 5000;

      continue;
    }

    if (body.error === 'access_denied') throw new ShareError('Sign-in was denied.');

    if (body.error === 'expired_token') break;

    throw new ShareError(`Sign-in failed: ${body.error ?? reply.status}.`);
  }

  throw new ShareError('The sign-in code expired. Run the command again.');
}
