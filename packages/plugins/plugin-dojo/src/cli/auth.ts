import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';

import type { DeployEnv } from 'frogbot';

import { ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { say } from './io.js';

type AuthFile = { tokens: Record<string, string> };

/** `$XDG_CONFIG_HOME/frogbotai/auth.json`, beside the gateway's config. */
export function authPath(env: DeployEnv): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'frogbotai', 'auth.json');
}

async function readAuth(env: DeployEnv): Promise<AuthFile> {
  try {
    const parsed = JSON.parse(await readFile(authPath(env), 'utf8')) as Partial<AuthFile>;

    return { tokens: { ...parsed.tokens } };
  } catch {
    return { tokens: {} };
  }
}

/** The stored token for this Dojo, if any. */
export async function readToken(env: DeployEnv, dojoUrl: string): Promise<string | undefined> {
  return (await readAuth(env)).tokens[dojoUrl];
}

/** Stores the token for this Dojo in an owner-only file. */
export async function writeToken(env: DeployEnv, dojoUrl: string, token: string): Promise<void> {
  const path = authPath(env);
  const auth = await readAuth(env);

  auth.tokens[dojoUrl] = token;

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Forgets this Dojo's token, and the file once no token is left. */
export async function removeToken(env: DeployEnv, dojoUrl: string): Promise<void> {
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

const maxCodes = 3;

/** Signs in with Dojo's device flow (RFC 8628) and stores the token; an expired code makes way for a new one. */
export async function deviceLogin(io: DojoIO, dojoUrl: string): Promise<string> {
  for (let codes = 1; ; codes += 1) {
    const token = await approvedToken(io, dojoUrl);

    if (token) {
      await writeToken(io.env, dojoUrl, token);
      say(io, '[frogbot] Signed in.');

      return token;
    }

    if (io.isTTY) {
      say(io, '[frogbot] The sign-in code expired.');

      if (await io.prompts.confirm('Get a new code?')) continue;
    } else if (codes < maxCodes) {
      say(io, "[frogbot] The sign-in code expired. Here's a new one.");

      continue;
    }

    throw new ShareError('The sign-in code expired. Run the command again.');
  }
}

async function approvedToken(io: DojoIO, dojoUrl: string): Promise<string | undefined> {
  const start = await post(`${dojoUrl}/api/cli/device/code`, {
    client_id: clientId,
    device_name: hostname(),
  });

  if (!start.ok) throw new ShareError(`Dojo refused the sign-in (${start.status}).`);

  const code = (await start.json()) as DeviceCode;
  const link = code.verification_uri_complete || code.verification_uri;

  say(
    io,
    code.verification_uri_complete
      ? '[frogbot] Sign in to Dojo: open this link and confirm the code.'
      : '[frogbot] Sign in to Dojo: open this link and enter the code.',
  );

  say(io, link);
  say(io, `Code: ${code.user_code}`);

  if (io.isTTY) io.openBrowser(link);

  const deadline = Date.now() + code.expires_in * 1000;
  let interval = (code.interval ?? 5) * 1000;

  while (Date.now() < deadline) {
    await io.wait(interval);

    const reply = await post(`${dojoUrl}/api/cli/device/token`, {
      grant_type: grantType,
      device_code: code.device_code,
      client_id: clientId,
    });

    const body = (await reply.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
    };

    if (reply.ok && body.access_token) return body.access_token;

    if (body.error === 'authorization_pending') continue;

    if (body.error === 'slow_down') {
      interval += 5000;

      continue;
    }

    if (body.error === 'access_denied') throw new ShareError('Sign-in was denied.');

    if (body.error === 'expired_token') return undefined;

    throw new ShareError(`Sign-in failed: ${body.error ?? reply.status}.`);
  }

  return undefined;
}
