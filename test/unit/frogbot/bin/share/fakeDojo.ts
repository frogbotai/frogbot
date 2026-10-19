import type { KeyObject } from 'node:crypto';
import {
  createDecipheriv,
  createHash,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { onTestFinished } from 'vitest';

export type FakeRequest = {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: Buffer;
  form?: FormData;
};

export type FakeWorkspace = { id: number; name: string; slug: string };

export type FakeBuild = {
  lines: string[];
  status: 'ready' | 'failed';
  error?: string;
  tail?: string[];
  /** The first log connection closes after this many lines, with no status. */
  dropAfter?: number;
};

/** Dojo's side of `share` and `logout`: the contract in 303's plan, recording every request. */
export type FakeDojo = {
  url: string;
  requests: FakeRequest[];
  /** Tokens Dojo accepts, by API key id. */
  tokens: Map<string, number>;
  workspaces: FakeWorkspace[];
  projects: { id: number; name: string; slug: string; workspace: number }[];
  /** Polls answered `authorization_pending` before the sign-in is approved. */
  pendingPolls: number;
  build: FakeBuild;
  /** Apps whose deployments get 403. */
  forbidden: Set<number>;
  /** The reply to `POST /api/projects`, instead of creating one. */
  projectReply?: { status: number; body: unknown };
  /** The private half of `GET /api/cli/sealing-key`. */
  sealingPrivateKey: KeyObject;
  /** Each app's stored keys, by app id. */
  keys: Map<number, Record<string, string>>;
  /** The body of `GET /api/apps/:app/keys`, instead of the stored keys. */
  keysReply?: unknown;
  /** Each app's fingerprint salt, 32 random bytes as base64url, made on first read. */
  salts: Map<number, string>;
  /** Every `keys` part Dojo opened, as sent. */
  opened: { values: Record<string, string>; updateKeys: boolean }[];
  revokeStatus: number;
  /** Runs after each request is answered, as `METHOD /path`. */
  afterRequest?: (route: string) => void;
  paths: () => string[];
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const payloadError = (res: ServerResponse, status: number, message: string) =>
  json(res, status, { errors: [{ message }] });

/** Dojo's side of the seal: ECDH with its private key, HKDF-SHA256 (`frogbot-share-keys`), AES-256-GCM. */
export function openKeys(
  sealed: { ephemeralPublicKey: string; iv: string; tag: string; ciphertext: string },
  privateKey: KeyObject,
): Record<string, string> {
  const publicKey = createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: sealed.ephemeralPublicKey },
    format: 'jwk',
  });

  const secret = diffieHellman({ privateKey, publicKey });
  const key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'frogbot-share-keys', 32));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64url'));

  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64url')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
}

/** 307's fingerprint: `base64url(sha256(salt + "\0" + projectId + "\0" + name + "\0" + value))`. */
export function fingerprint(salt: string, appId: number, name: string, value: string): string {
  return createHash('sha256').update(`${salt}\0${appId}\0${name}\0${value}`).digest('base64url');
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks);
}

/** Starts a fake Dojo on a free port, closed when the test finishes. */
export async function startFakeDojo(): Promise<FakeDojo> {
  let keys = 0;
  let polls = 0;
  let logConnections = 0;
  const sealing = generateKeyPairSync('x25519');

  const dojo: FakeDojo = {
    url: '',
    requests: [],
    tokens: new Map(),
    workspaces: [{ id: 1, name: 'Trend Capital', slug: 'trend-capital' }],
    projects: [],
    pendingPolls: 1,
    build: { lines: ['step 1', 'step 2'], status: 'ready' },
    forbidden: new Set(),
    sealingPrivateKey: sealing.privateKey,
    keys: new Map(),
    salts: new Map(),
    opened: [],
    revokeStatus: 200,
    paths: () => dojo.requests.map((request) => `${request.method} ${request.path}`),
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', dojo.url);
    const body = await readBody(req);
    const contentType = req.headers['content-type'] ?? '';

    const form = contentType.startsWith('multipart/form-data')
      ? await new Response(Uint8Array.from(body), {
          headers: { 'content-type': contentType },
        }).formData()
      : undefined;

    const route = `${req.method} ${url.pathname}`;

    dojo.requests.push({
      method: req.method ?? '',
      path: url.pathname,
      headers: req.headers,
      body,
      form,
    });

    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const keyId = token ? dojo.tokens.get(token) : undefined;
    const signedIn = keyId !== undefined;

    if (route === 'POST /api/cli/device/code') {
      return json(res, 200, {
        device_code: 'device-1',
        user_code: 'BCDF-GHJK',
        verification_uri: `${dojo.url}/device`,
        verification_uri_complete: `${dojo.url}/device?user_code=BCDF-GHJK`,
        expires_in: 600,
        interval: 0,
      });
    }

    if (route === 'POST /api/cli/device/token') {
      polls += 1;

      if (polls <= dojo.pendingPolls) return json(res, 400, { error: 'authorization_pending' });

      polls = 0;
      keys += 1;

      const issued = `fb_test_${keys}`;

      dojo.tokens.set(issued, keys);

      return json(res, 200, { access_token: issued, token_type: 'Bearer' });
    }

    if (route === 'GET /api/users/me') {
      return json(res, 200, {
        user: signedIn ? { id: 1, email: 'colby@example.com', apiKeyId: keyId } : null,
      });
    }

    if (!signedIn) return payloadError(res, 401, 'You are not allowed to perform this action.');

    if (route === 'GET /api/workspaces') {
      return json(res, 200, { docs: dojo.workspaces, totalDocs: dojo.workspaces.length });
    }

    if (route === 'POST /api/projects') {
      if (dojo.projectReply) return json(res, dojo.projectReply.status, dojo.projectReply.body);

      const data = JSON.parse(body.toString()) as { name: string; slug: string; workspace: number };
      const project = { id: dojo.projects.length + 1, ...data };

      dojo.projects.push(project);

      return json(res, 201, { doc: project, message: 'Project successfully created.' });
    }

    if (route === 'GET /api/cli/sealing-key') {
      const publicKey = createPublicKey(dojo.sealingPrivateKey).export({ format: 'jwk' }).x;

      return json(res, 200, { keyId: 'seal-1', publicKey });
    }

    const app = /^\/api\/apps\/(\d+)\/(deployments|keys)$/.exec(url.pathname);
    const appId = Number(app?.[1]);
    const owned =
      !dojo.forbidden.has(appId) && dojo.projects.some((project) => project.id === appId);

    if (app && !owned) return payloadError(res, 403, 'Only the app’s owners can publish it.');

    if (req.method === 'GET' && app?.[2] === 'keys') {
      const stored = Object.entries(dojo.keys.get(appId) ?? {});
      if (dojo.keysReply !== undefined) return json(res, 200, dojo.keysReply);

      const salt = dojo.salts.get(appId) ?? randomBytes(32).toString('base64url');

      dojo.salts.set(appId, salt);

      return json(res, 200, {
        salt,
        keys: stored.map(([name, value]) => ({
          name,
          last4: value.length < 12 ? '' : value.slice(-4),
          source: 'share',
          fingerprint: fingerprint(salt, appId, name, value),
        })),
      });
    }

    if (req.method === 'POST' && app?.[2] === 'deployments') {
      const part = form?.get('keys');

      if (typeof part === 'string') {
        const sealed = JSON.parse(part) as Parameters<typeof openKeys>[0] & {
          keyId: string;
          updateKeys?: boolean;
        };

        if (sealed.keyId !== 'seal-1') return payloadError(res, 400, 'Unknown sealing key.');

        const values = openKeys(sealed, dojo.sealingPrivateKey);
        const updateKeys = sealed.updateKeys === true;
        const stored = { ...dojo.keys.get(appId) };

        dojo.opened.push({ values, updateKeys });

        for (const [name, value] of Object.entries(values)) {
          if (updateKeys || !(name in stored)) stored[name] = value;
        }

        dojo.keys.set(appId, stored);
      }

      return json(res, 201, { deploymentId: 7 });
    }

    if (route === 'GET /api/deployments/7/logs') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });

      const after = Number(req.headers['last-event-id'] ?? 0);

      logConnections += 1;

      const drop = logConnections === 1 ? dojo.build.dropAfter : undefined;
      const lines = dojo.build.lines.slice(after, drop);

      lines.forEach((line, index) => {
        res.write(`id: ${after + index + 1}\nevent: log\ndata: ${line}\n\n`);
      });

      if (drop !== undefined) {
        res.end();

        return;
      }

      const { status, error = null, tail = null } = dojo.build;
      const live = status === 'ready' ? { url: 'https://deals.frogbot.app' } : {};

      res.end(`event: status\ndata: ${JSON.stringify({ status, error, tail, ...live })}\n\n`);

      return;
    }

    const revoke = /^\/api\/api-keys\/(\d+)\/revoke$/.exec(url.pathname);

    if (req.method === 'POST' && revoke) {
      if (dojo.revokeStatus !== 200) return payloadError(res, dojo.revokeStatus, 'Revoke failed.');

      for (const [issued, id] of dojo.tokens) {
        if (id === Number(revoke[1])) dojo.tokens.delete(issued);
      }

      return json(res, 200, { id: Number(revoke[1]) });
    }

    payloadError(res, 404, `No route for ${route}.`);
  };

  const server = createServer((req, res) => {
    handle(req, res).then(
      () => dojo.afterRequest?.(`${req.method} ${new URL(req.url ?? '/', dojo.url).pathname}`),
      (error: unknown) => payloadError(res, 500, String(error)),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  dojo.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );

  return dojo;
}
