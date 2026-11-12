import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import type { DeployEnv } from 'frogbot';

import { needsSignIn, ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { canWait, dojoProgram, say } from './io.js';

type PendingCode = {
  deviceCode: string;
  userCode: string;
  link: string;
  carriesCode: boolean;
  expiresAt: number;
  interval: number;
};

type AuthFile = { tokens: Record<string, string>; pending: Record<string, PendingCode> };

/** `$XDG_CONFIG_HOME/frogbotai/auth.json`, beside the gateway's config. */
export function authPath(env: DeployEnv): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'frogbotai', 'auth.json');
}

async function readAuth(env: DeployEnv): Promise<AuthFile> {
  try {
    const parsed = JSON.parse(await readFile(authPath(env), 'utf8')) as Partial<AuthFile>;

    return { tokens: { ...parsed.tokens }, pending: { ...parsed.pending } };
  } catch {
    return { tokens: {}, pending: {} };
  }
}

const lockTries = 100;
const lockWaitMs = 20;
const staleLockMs = 10_000;

async function takeLock(lock: string): Promise<boolean> {
  return writeFile(lock, '', { flag: 'wx', mode: 0o600 }).then(
    () => true,
    async (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;

      const since = await stat(lock).then(
        (lockStat) => Date.now() - lockStat.mtimeMs,
        () => 0,
      );

      if (since > staleLockMs) await rm(lock, { force: true });
      else await setTimeout(lockWaitMs);

      return false;
    },
  );
}

async function updateAuth(env: DeployEnv, change: (auth: AuthFile) => void): Promise<void> {
  const path = authPath(env);
  const lock = `${path}.lock`;
  let held = false;

  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  for (let tries = 0; tries < lockTries && !held; tries += 1) held = await takeLock(lock);

  try {
    await writeAuth(env, change);
  } finally {
    if (held) await rm(lock, { force: true });
  }
}

async function writeAuth(env: DeployEnv, change: (auth: AuthFile) => void): Promise<void> {
  const path = authPath(env);
  const auth = await readAuth(env);

  change(auth);

  if (Object.keys(auth.tokens).length === 0 && Object.keys(auth.pending).length === 0) {
    await rm(path, { force: true });

    return;
  }

  const { pending, ...rest } = auth;
  const file = Object.keys(pending).length > 0 ? auth : rest;

  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** The stored token for this Dojo, if any. */
export async function readToken(env: DeployEnv, dojoUrl: string): Promise<string | undefined> {
  return (await readAuth(env)).tokens[dojoUrl];
}

/** Stores the token for this Dojo in an owner-only file, dropping its pending code. */
export async function writeToken(env: DeployEnv, dojoUrl: string, token: string): Promise<void> {
  await updateAuth(env, (auth) => {
    auth.tokens[dojoUrl] = token;
    delete auth.pending[dojoUrl];
  });
}

/** Forgets this Dojo's token, and the file once nothing is left. */
export async function removeToken(env: DeployEnv, dojoUrl: string): Promise<void> {
  await updateAuth(env, (auth) => {
    delete auth.tokens[dojoUrl];
  });
}

async function readPending(env: DeployEnv, dojoUrl: string): Promise<PendingCode | undefined> {
  return live((await readAuth(env)).pending[dojoUrl]);
}

async function forgetPending(env: DeployEnv, dojoUrl: string): Promise<void> {
  await updateAuth(env, (auth) => {
    delete auth.pending[dojoUrl];
  });
}

/** Forgets this Dojo's token and any sign-in code still waiting for its person. */
export async function forgetSignIn(env: DeployEnv, dojoUrl: string): Promise<void> {
  await updateAuth(env, (auth) => {
    delete auth.tokens[dojoUrl];
    delete auth.pending[dojoUrl];
  });
}

function live(code: PendingCode | undefined): PendingCode | undefined {
  return code && code.expiresAt > Date.now() ? code : undefined;
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

/**
 * Signs in with Dojo's device flow (RFC 8628) and stores the token. With a terminal or `--wait` it waits for the
 * person, and an expired code makes way for a new one. Without either it exits 3 with the link, keeping the code,
 * so running the command again once the person confirmed it signs in.
 */
export async function deviceLogin(io: DojoIO, dojoUrl: string): Promise<string> {
  const waits = canWait(io);

  for (let codes = 1; ; codes += 1) {
    const saved = await readPending(io.env, dojoUrl);
    const code = saved ?? (await newCode(io.env, dojoUrl));

    if (!waits && !saved) throw signInNeeded(io, code);

    const answer = await (waits ? pollToken(io, dojoUrl, code) : askToken(dojoUrl, code));

    if (answer.status === 'refused') {
      await forgetPending(io.env, dojoUrl);

      throw new ShareError(answer.message);
    }

    if (answer.status === 'approved') {
      await writeToken(io.env, dojoUrl, answer.token);
      say(io, '[frogbot] Signed in.');

      return answer.token;
    }

    if (answer.status !== 'expired') throw signInNeeded(io, code);

    await forgetPending(io.env, dojoUrl);

    if (!waits) continue;

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

function signInNeeded(io: DojoIO, code: PendingCode): ShareError {
  const step = code.carriesCode ? 'confirm' : 'enter';

  return new ShareError(
    `Sign in to Dojo: open ${code.link} and ${step} the code ${code.userCode}, then run the command again. Add --wait to wait for the sign-in here, or set FROGBOT_DOJO_TOKEN to a key from "${dojoProgram(io.program)} keys create".`,
    needsSignIn,
    { needs: 'sign-in', link: code.link, userCode: code.userCode },
  );
}

async function newCode(env: DeployEnv, dojoUrl: string): Promise<PendingCode> {
  const start = await post(`${dojoUrl}/api/cli/device/code`, {
    client_id: clientId,
    device_name: hostname(),
  });

  if (!start.ok) throw new ShareError(`Dojo refused the sign-in (${start.status}).`);

  const reply = (await start.json()) as DeviceCode;

  const code: PendingCode = {
    deviceCode: reply.device_code,
    userCode: reply.user_code,
    link: reply.verification_uri_complete || reply.verification_uri,
    carriesCode: Boolean(reply.verification_uri_complete),
    expiresAt: Date.now() + reply.expires_in * 1000,
    interval: reply.interval ?? 5,
  };

  let kept = code;

  await updateAuth(env, (auth) => {
    kept = live(auth.pending[dojoUrl]) ?? code;
    auth.pending[dojoUrl] = kept;
  });

  return kept;
}

type Answer =
  | { status: 'approved'; token: string }
  | { status: 'refused'; message: string }
  | { status: 'pending' | 'slow_down' | 'expired' };

async function askToken(dojoUrl: string, code: PendingCode): Promise<Answer> {
  const reply = await post(`${dojoUrl}/api/cli/device/token`, {
    grant_type: grantType,
    device_code: code.deviceCode,
    client_id: clientId,
  });

  const body = (await reply.json().catch(() => ({}))) as { access_token?: string; error?: string };

  if (reply.ok && body.access_token) return { status: 'approved', token: body.access_token };
  if (body.error === 'authorization_pending') return { status: 'pending' };
  if (body.error === 'slow_down') return { status: 'slow_down' };
  if (body.error === 'expired_token') return { status: 'expired' };
  if (body.error === 'access_denied') return { status: 'refused', message: 'Sign-in was denied.' };
  if (body.error) return { status: 'refused', message: `Sign-in failed: ${body.error}.` };

  throw new ShareError(
    `Couldn't reach Dojo to finish the sign-in (${reply.status}). Run the command again.`,
  );
}

async function pollToken(io: DojoIO, dojoUrl: string, code: PendingCode): Promise<Answer> {
  say(
    io,
    code.carriesCode
      ? '[frogbot] Sign in to Dojo: open this link and confirm the code.'
      : '[frogbot] Sign in to Dojo: open this link and enter the code.',
  );

  say(io, code.link);
  say(io, `Code: ${code.userCode}`);

  if (io.isTTY) io.openBrowser(code.link);

  let interval = code.interval * 1000;

  while (Date.now() < code.expiresAt) {
    await io.wait(interval);

    const answer = await askToken(dojoUrl, code);

    if (answer.status === 'slow_down') interval += 5000;
    else if (answer.status !== 'pending') return answer;
  }

  return { status: 'expired' };
}
