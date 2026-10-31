import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { FrogBotRequest, PieceOAuthSave } from 'frogbot/pieces';

import {
  AGENT_NAME,
  AUTHORIZE_URL,
  clientKey,
  HOST_KEY,
  PLAN_SCOPE,
  REGISTRATION_CLIENT_ID,
  RESOURCE,
  SCOPE,
  USAGE_URL,
} from './constants.js';
import { failurePage, planNoticePage } from './page.js';
import { exchangeCode, verifyIDToken } from './tokens.js';

const LISTEN_MS = 10 * 60 * 1000;

const randomValue = () => randomBytes(32).toString('base64url');

const attempts = new Map<string, () => void>();

type Attempt = {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  savedClientId?: string;
  returnTo: string;
  save: PieceOAuthSave;
  saveClientId: (clientId: string) => Promise<void>;
};

class SignInError extends Error {}

const NO_PLAN =
  "ChatGPT didn't allow plan use. Sign in again and allow it, or paste an OpenAI API key instead.";

async function hostId(req: FrogBotRequest): Promise<string> {
  const { kv } = req.frogbot;

  await kv.setIfAbsent(HOST_KEY, `urn:uuid:${randomUUID()}`);

  const id = await kv.get(HOST_KEY);

  if (typeof id !== 'string') throw new Error("Couldn't read this install's ChatGPT host ID.");

  return id;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);

      const address = server.address();

      if (!address || typeof address === 'string') reject(new Error('No callback port.'));
      else resolve(address.port);
    });
  });
}

async function complete(attempt: Attempt, params: URLSearchParams): Promise<string> {
  const error = params.get('error_description') ?? params.get('error');

  if (error) throw new SignInError(`ChatGPT sign-in was stopped: ${error}`);

  if (params.get('state') !== attempt.state) {
    throw new SignInError('This sign-in is out of date. Start again from Linked accounts.');
  }

  const code = params.get('code');

  if (!code) throw new SignInError("ChatGPT didn't return a sign-in code. Try again.");

  const returned = params.get('client_id') ?? undefined;

  if (attempt.savedClientId && returned && returned !== attempt.savedClientId) {
    throw new SignInError(
      'ChatGPT returned a different registration than this account. Try again.',
    );
  }

  const clientId = attempt.savedClientId ?? returned;

  if (!clientId || clientId === REGISTRATION_CLIENT_ID) {
    throw new SignInError("ChatGPT didn't return a client ID. Try again.");
  }

  const tokens = await exchangeCode({
    code,
    clientId,
    redirectUri: attempt.redirectUri,
    verifier: attempt.verifier,
  }).catch(() => {
    throw new SignInError("Couldn't finish the ChatGPT sign-in. Try again.");
  });

  if (!tokens.scope?.split(/\s+/).includes(PLAN_SCOPE)) throw new SignInError(NO_PLAN);

  const identity = tokens.id_token
    ? await verifyIDToken({ token: tokens.id_token, clientId, nonce: attempt.nonce }).catch(
        () => undefined,
      )
    : undefined;

  if (!identity) throw new SignInError('ChatGPT returned an invalid sign-in. Try again.');

  await attempt
    .save({
      tokens: { ...tokens, client_id: clientId },
      account: { id: identity.sub, label: identity.email ?? 'ChatGPT', email: identity.email },
    })
    .catch(() => {
      throw new SignInError("Couldn't save the ChatGPT account. Try again.");
    });

  return clientId;
}

function respond(response: ServerResponse, status: number, html: string): void {
  response
    .writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    .end(html);
}

async function handle(attempt: Attempt, url: URL, response: ServerResponse): Promise<void> {
  try {
    const clientId = await complete(attempt, url.searchParams);

    if (attempt.savedClientId) {
      response.writeHead(302, { location: attempt.returnTo, 'cache-control': 'no-store' }).end();

      return;
    }

    await attempt.saveClientId(clientId);
    respond(response, 200, planNoticePage({ returnTo: attempt.returnTo, usageUrl: USAGE_URL }));
  } catch (error) {
    const message =
      error instanceof SignInError
        ? error.message
        : "Couldn't finish the ChatGPT sign-in. Try again.";

    respond(response, 400, failurePage({ message, returnTo: attempt.returnTo }));
  }
}

function authorizeURL(attempt: Attempt, host: string): string {
  const challenge = createHash('sha256').update(attempt.verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: attempt.savedClientId ?? REGISTRATION_CLIENT_ID,
    ...(attempt.savedClientId ? {} : { agent_name_hint: AGENT_NAME }),
    ext_agent_host_id: host,
    response_type: 'code',
    redirect_uri: attempt.redirectUri,
    scope: SCOPE,
    resource: RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  return `${AUTHORIZE_URL}?${params}`;
}

/**
 * Starts "Continue with ChatGPT": a one-shot listener on `127.0.0.1:<random>/auth/callback`
 * that takes one callback, then closes; it also closes after 10 minutes or on the user's next
 * attempt. Returns OpenAI's authorize URL.
 */
export async function authorizeChatGPT({
  req,
  returnTo,
  save,
}: {
  req: FrogBotRequest;
  returnTo: string;
  save: PieceOAuthSave;
}): Promise<string> {
  const user = req.user;

  if (!user || typeof user.collection !== 'string') {
    throw new Error('Sign in to FrogBot before linking ChatGPT.');
  }

  const { kv } = req.frogbot;
  const key = clientKey({ collection: user.collection, id: user.id });
  const host = await hostId(req);
  const saved = await kv.get(key);

  attempts.get(key)?.();

  const attempt: Attempt = {
    state: randomValue(),
    nonce: randomValue(),
    verifier: randomValue(),
    redirectUri: '',
    ...(typeof saved === 'string' ? { savedClientId: saved } : {}),
    returnTo,
    save,
    saveClientId: (clientId) => kv.set(key, clientId),
  };

  let done = false;

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname !== '/auth/callback') {
      response.writeHead(404).end('Not found');

      return;
    }

    if (done) {
      response.writeHead(409).end('This sign-in already finished.');

      return;
    }

    done = true;
    void handle(attempt, url, response).finally(close);
  });

  const timer = setTimeout(() => close(), LISTEN_MS);

  function close() {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
    if (attempts.get(key) === close) attempts.delete(key);
  }

  timer.unref();
  server.unref();
  attempts.set(key, close);

  const port = await listen(server).catch((error: unknown) => {
    close();
    throw error;
  });

  attempt.redirectUri = `http://127.0.0.1:${port}/auth/callback`;

  return authorizeURL(attempt, host);
}
