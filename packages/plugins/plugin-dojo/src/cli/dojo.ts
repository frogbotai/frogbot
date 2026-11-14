import { createParser } from 'eventsource-parser';
import type { DeployEnv } from 'frogbot';

import { deviceLogin, readToken, removeToken } from './auth.js';
import { dojoStop, needsSignIn, reachDojo, ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { canWait, dojoProgram } from './io.js';

/** `FROGBOT_DOJO_URL`, or Dojo itself. */
export function dojoUrl(env: DeployEnv): string {
  return (env.FROGBOT_DOJO_URL || 'https://dojo.frogbot.ai').replace(/\/+$/, '');
}

function inCI(env: DeployEnv): boolean {
  return Boolean(env.CI) && env.CI !== 'false' && env.CI !== '0';
}

export type DojoUser = { id: string | number; email?: string; apiKeyId?: string | number };

export type DojoClient = {
  url: string;
  /** A signed-in call; a 401 signs in again once and repeats it. */
  request: (path: string, init?: () => RequestInit | Promise<RequestInit>) => Promise<Response>;
  /** The signed-in user, signing in first when there is no working token. */
  signIn: () => Promise<DojoUser>;
  /** The signed-in user, or `undefined` when there is no working token; never signs in. */
  currentUser: () => Promise<DojoUser | undefined>;
};

/**
 * A Dojo client that signs in with `FROGBOT_DOJO_TOKEN`, then the stored token, then the device flow.
 * A refused `FROGBOT_DOJO_TOKEN` exits 3 instead of starting the device flow, and so does CI with no token.
 */
export function createDojo(io: DojoIO): DojoClient {
  const url = dojoUrl(io.env);
  const envToken = io.env.FROGBOT_DOJO_TOKEN || undefined;
  let token = envToken;

  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);

    if (token) headers.set('authorization', `Bearer ${token}`);
    if (!headers.has('accept')) headers.set('accept', 'application/json');

    return reachDojo(url, io.env, () => fetch(`${url}${path}`, { ...init, headers }));
  };

  const login = async () => {
    if (envToken) {
      throw new ShareError(
        `Dojo didn't accept FROGBOT_DOJO_TOKEN at ${url}; it may be revoked. Set a working key, or unset it and run ${dojoProgram(io.program)} login.`,
        needsSignIn,
        { needs: 'sign-in' },
      );
    }

    if (!canWait(io) && inCI(io.env)) {
      throw new ShareError(
        `No Dojo sign-in here, and nobody in CI can open a sign-in link. Set FROGBOT_DOJO_TOKEN to a Dojo API key from "${dojoProgram(io.program)} keys create", stored as a CI secret.`,
        needsSignIn,
        { needs: 'sign-in' },
      );
    }

    await removeToken(io.env, url);
    token = await deviceLogin(io, url);
  };

  const me = async (): Promise<DojoUser | undefined> => {
    const response = await send('/api/users/me');

    if (response.status === 401) return undefined;
    if (!response.ok) throw await dojoStop(response, "Couldn't reach Dojo");

    return ((await response.json()) as { user?: DojoUser | null }).user ?? undefined;
  };

  const request: DojoClient['request'] = async (path, init = () => ({})) => {
    token ??= await readToken(io.env, url);
    if (!token) await login();

    const response = await send(path, await init());

    if (response.status !== 401) return response;

    await login();

    return send(path, await init());
  };

  const signIn = async () => {
    token ??= await readToken(io.env, url);

    const user = token ? await me() : undefined;

    if (user) return user;

    await login();

    const signedIn = await me();

    if (!signedIn) {
      throw new ShareError("Dojo didn't accept the new sign-in. Run the command again.");
    }

    return signedIn;
  };

  const currentUser = async () => {
    token ??= await readToken(io.env, url);

    return token ? me() : undefined;
  };

  return { url, request, signIn, currentUser };
}

/** What a call needs, named when Dojo refuses it with 403: `owner access to the app`. */
export type DojoCall = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** The failure's lead-in: `Couldn't list your apps`. */
  what: string;
  needs?: string;
};

/** A signed-in JSON call. A refusal stops with Dojo's words, and a 403 says what the call needs. */
export async function dojoJSON<T>(
  dojo: DojoClient,
  path: string,
  { method = 'GET', body, what, needs }: DojoCall,
): Promise<T> {
  const response = await dojo.request(path, () => ({
    method,
    ...(body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  }));

  if (response.ok) return (await response.json()) as T;

  throw await dojoStop(
    response,
    what,
    response.status === 403 && needs ? ` It needs ${needs}.` : '',
  );
}

/** Every doc of a Dojo list, page by page. `path` must already have a query: pages go after it. */
export async function dojoList<T>(dojo: DojoClient, path: string, call: DojoCall): Promise<T[]> {
  const docs: T[] = [];

  for (let page = 1; ; page += 1) {
    const reply = await dojoJSON<{ docs: T[]; hasNextPage?: boolean }>(
      dojo,
      `${path}&page=${page}`,
      call,
    );

    docs.push(...reply.docs);

    if (reply.hasNextPage !== true || reply.docs.length === 0) return docs;
  }
}

/** One path segment, encoded. Refuses empty, `.` and `..`, which a URL resolves out of their route. */
export function segment(value: string | number): string {
  const text = String(value);

  if (text === '' || text === '.' || text === '..') {
    throw new ShareError(`"${text}" can't name anything on Dojo.`, 2);
  }

  return encodeURIComponent(text);
}

/** The last `status` event of a build. */
export type BuildStatus = {
  status: string;
  error?: string | null;
  tail?: string[] | null;
  url?: string;
};

const reconnects = 5;

/** Streams a deployment's build log, resuming with `Last-Event-ID`, until the build ends. */
export async function followBuild({
  dojo,
  deploymentId,
  program,
  onLine,
}: {
  dojo: DojoClient;
  deploymentId: string | number;
  /** The command's program, for the command that picks a lost log up again. */
  program: string;
  onLine: (line: string) => void;
}): Promise<BuildStatus> {
  let lastId: string | undefined;
  let tries = 0;

  for (;;) {
    const seen: { status?: BuildStatus } = {};
    const resumedFrom = lastId;

    const parser = createParser({
      onEvent: (event) => {
        if (event.event === 'log') {
          if (event.id) lastId = event.id;
          onLine(event.data);
        } else if (event.event === 'status') {
          seen.status = JSON.parse(event.data) as BuildStatus;
        }
      },
    });

    const response = await dojo.request(`/api/deployments/${segment(deploymentId)}/logs`, () => ({
      headers: { accept: 'text/event-stream', ...(lastId ? { 'last-event-id': lastId } : {}) },
    }));

    const body = response.body;

    if (!response.ok || !body) {
      throw await dojoStop(response, "Couldn't read the build log");
    }

    const read = async () => {
      for await (const chunk of body.pipeThrough(new TextDecoderStream())) parser.feed(chunk);
    };

    await read().catch(() => undefined);

    const final = seen.status;

    if (final && (final.status === 'failed' || final.status === 'ready' || final.url)) {
      return final;
    }

    tries = lastId === resumedFrom ? tries + 1 : 0;

    if (tries >= reconnects) {
      throw new ShareError(
        `Lost the build log. The build may still finish; follow it with ${dojoProgram(program)} deployments logs ${deploymentId} --follow.`,
        1,
        { code: 'BUILD_LOG_LOST', deploymentId },
      );
    }
  }
}
