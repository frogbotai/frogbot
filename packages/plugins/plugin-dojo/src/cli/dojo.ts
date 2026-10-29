import { createParser } from 'eventsource-parser';

import { deviceLogin, readToken, removeToken } from './auth.js';
import { ShareError } from './error.js';
import type { ShareEnv, ShareIO } from './io.js';

/** `FROGBOT_DOJO_URL`, or Dojo itself. */
export function dojoUrl(env: ShareEnv): string {
  return (env.FROGBOT_DOJO_URL || 'https://dojo.frogbot.ai').replace(/\/+$/, '');
}

/** A failed Dojo reply: Payload's `errors` (with a `ValidationError`'s field errors), or an OAuth-style `error`. */
export type DojoErrorBody = {
  errors?: { message?: string; data?: { errors?: { path?: string; message?: string }[] } }[];
  error?: string;
  message?: string;
};

/** A failed reply's body and Dojo's own words for it, or the status. */
export async function dojoError(
  response: Response,
): Promise<{ body?: DojoErrorBody; message: string }> {
  const body = (await response.json().catch(() => undefined)) as DojoErrorBody | undefined;

  return {
    body,
    message:
      body?.errors?.find((error) => error.message)?.message ||
      body?.message ||
      body?.error ||
      `Dojo answered ${response.status}.`,
  };
}

/** Dojo's own words for a failed reply. */
export async function dojoMessage(response: Response): Promise<string> {
  return (await dojoError(response)).message;
}

export type DojoUser = { id: string | number; email?: string; apiKeyId?: string | number };

export type DojoClient = {
  url: string;
  /** A signed-in call; a 401 signs in again once and repeats it. */
  request: (path: string, init?: () => RequestInit | Promise<RequestInit>) => Promise<Response>;
  /** The signed-in user, signing in first when there is no working token. */
  signIn: () => Promise<DojoUser>;
};

/** A Dojo client that signs in with the stored token, or the device flow when it has none. */
export function createDojo(io: ShareIO): DojoClient {
  const url = dojoUrl(io.env);
  let token: string | undefined;

  const send = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);

    if (token) headers.set('authorization', `Bearer ${token}`);
    if (!headers.has('accept')) headers.set('accept', 'application/json');

    return fetch(`${url}${path}`, { ...init, headers });
  };

  const login = async () => {
    await removeToken(io.env, url);
    token = await deviceLogin(io, url);
  };

  const me = async (): Promise<DojoUser | undefined> => {
    const response = await send('/api/users/me');

    if (response.status === 401) return undefined;
    if (!response.ok) throw new ShareError(`Couldn't reach Dojo: ${await dojoMessage(response)}`);

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

  return { url, request, signIn };
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
  onLine,
}: {
  dojo: DojoClient;
  deploymentId: string | number;
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

    const response = await dojo.request(`/api/deployments/${deploymentId}/logs`, () => ({
      headers: { accept: 'text/event-stream', ...(lastId ? { 'last-event-id': lastId } : {}) },
    }));

    const body = response.body;

    if (!response.ok || !body) {
      throw new ShareError(`Couldn't read the build log: ${await dojoMessage(response)}`);
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
      throw new ShareError('Lost the build log. The build may still finish; check it in Dojo.');
    }
  }
}
