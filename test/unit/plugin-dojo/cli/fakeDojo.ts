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

import { snapshotKey } from '../../../../packages/plugins/plugin-dojo/src/cli/data/upload.js';

export type FakeRequest = {
  method: string;
  path: string;
  search: string;
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

export type FakeData = {
  /** Objects up to this size get one PUT; larger ones go multipart in parts of this size. */
  partSize: number;
  /** The app has a started version, so `data-uploads` answers 409; set once a build is ready. */
  started: boolean;
  /** The app's bucket, by key. */
  bucket: Map<string, Buffer>;
  /** PUTs answered 500 before one succeeds, by `<key>` or `<key>#<part number>`. */
  failures: Map<string, number>;
  /** Every multipart upload completed, as sent. */
  completed: { key: string; uploadId: string; parts: { partNumber: number; etag: string }[] }[];
  /** Each deployment's `data` field, as sent; `undefined` when absent. */
  sent: (string | undefined)[];
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
  /** 300's `data-uploads` and the app's bucket, which takes the signed PUTs at `/bucket/<key>`. */
  data: FakeData;
  /** The caller's `level` in `GET /api/apps/:app`; left out of the reply when unset, as an older Dojo does. */
  level?: 'editor' | 'owner';
  /** The live version's archive, served by `GET /api/apps/:app/source`; 404 when unset. */
  source?: Buffer;
  /** The reply to `GET /api/apps/:app`, instead of the app. */
  appReply?: { status: number; message: string };
  /** The reply to `GET /api/apps/:app/source`, instead of the archive. */
  sourceReply?: { status: number; message: string };
  /** The app's runtime log, oldest first, served by `GET /api/apps/:app/logs`. */
  logs: { at: string; message: string }[];
  /** The status `GET /api/apps/:app/logs` answers with, in the contract's words, instead of the lines. */
  logsStatus?: 403 | 404 | 502;
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

const logsRefusals = {
  403: "You can't share to this app. Only its editors and owners can.",
  404: 'No such app.',
  502: "Dojo couldn't read this app's logs. Try again in a moment.",
};

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
    data: {
      partSize: 64 * 1024 * 1024,
      started: false,
      bucket: new Map(),
      failures: new Map(),
      completed: [],
      sent: [],
    },
    logs: [],
    paths: () => dojo.requests.map((request) => `${request.method} ${request.path}`),
  };

  const parts = new Map<
    string,
    { key: string; parts: Map<number, { etag: string; body: Buffer }> }
  >();

  let uploadIds = 0;

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
      search: url.search,
      headers: req.headers,
      body,
      form,
    });

    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const keyId = token ? dojo.tokens.get(token) : undefined;
    const signedIn = keyId !== undefined;

    if (req.method === 'PUT' && url.pathname.startsWith('/bucket/')) {
      const key = decodeURIComponent(url.pathname.slice('/bucket/'.length));
      const uploadId = url.searchParams.get('uploadId');
      const partNumber = Number(url.searchParams.get('partNumber'));
      const failure = uploadId ? `${key}#${partNumber}` : key;
      const failures = dojo.data.failures.get(failure) ?? 0;

      if (failures > 0) {
        dojo.data.failures.set(failure, failures - 1);
        res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');

        return;
      }

      const etag = `"${createHash('md5').update(body).digest('hex')}"`;

      if (uploadId) parts.get(uploadId)?.parts.set(partNumber, { etag, body });
      else dojo.data.bucket.set(key, body);

      res.writeHead(200, { etag }).end();

      return;
    }

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

    const dataUpload = /^\/api\/apps\/(\d+)\/data-uploads(\/complete)?$/.exec(url.pathname);

    if (req.method === 'POST' && dataUpload) {
      const appId = Number(dataUpload[1]);

      if (dojo.forbidden.has(appId) || !dojo.projects.some((project) => project.id === appId)) {
        return payloadError(res, 403, 'Only the app’s owners can publish it.');
      }

      if (dojo.data.started) {
        return payloadError(
          res,
          409,
          'This app has already started, so share can no longer bring data to it.',
        );
      }

      if (dataUpload[2]) {
        const { uploads } = JSON.parse(body.toString()) as { uploads: FakeData['completed'] };

        for (const upload of uploads) {
          const received = parts.get(upload.uploadId);

          if (received?.key !== upload.key) return payloadError(res, 400, 'No such upload.');

          const sent = upload.parts.map(({ partNumber, etag }) => {
            const part = received.parts.get(partNumber);

            return part?.etag === etag ? part.body : undefined;
          });

          if (sent.some((part) => !part)) return payloadError(res, 400, 'A part is missing.');

          dojo.data.bucket.set(upload.key, Buffer.concat(sent as Buffer[]));
          dojo.data.completed.push(upload);
          parts.delete(upload.uploadId);
        }

        return json(res, 200, { completed: uploads.length });
      }

      const { objects } = JSON.parse(body.toString()) as {
        objects: { key: string; size: number }[];
      };

      const { partSize } = dojo.data;
      const signed = (key: string) =>
        `${dojo.url}/bucket/${key.split('/').map(encodeURIComponent).join('/')}`;

      return json(res, 200, {
        objects: objects.map(({ key, size }) => {
          if (key !== snapshotKey && dojo.data.bucket.get(key)?.length === size) {
            return { key, done: true };
          }

          if (size <= partSize) return { key, put: signed(key) };

          uploadIds += 1;

          const uploadId = `upload-${uploadIds}`;

          parts.set(uploadId, { key, parts: new Map() });

          return {
            key,
            uploadId,
            partSize,
            parts: Array.from(
              { length: Math.ceil(size / partSize) },
              (_, index) => `${signed(key)}?uploadId=${uploadId}&partNumber=${index + 1}`,
            ),
          };
        }),
      });
    }

    const app = /^\/api\/apps\/([^/]+)(?:\/(deployments|keys|logs|source))?$/.exec(url.pathname);
    const appRef = decodeURIComponent(app?.[1] ?? '');
    const bySlug = /^\d+$/.test(appRef)
      ? undefined
      : dojo.projects.find((project) => project.slug === appRef);

    if (app && !/^\d+$/.test(appRef) && !bySlug) return payloadError(res, 404, 'No such app.');

    const appId = bySlug?.id ?? Number(appRef);
    const owned =
      !dojo.forbidden.has(appId) && dojo.projects.some((project) => project.id === appId);

    if (req.method === 'GET' && app && !app[2] && dojo.appReply) {
      return payloadError(res, dojo.appReply.status, dojo.appReply.message);
    }

    if (app && !owned) return payloadError(res, 403, 'Only the app’s owners can publish it.');

    if (req.method === 'GET' && app && !app[2]) {
      const project = dojo.projects.find(({ id }) => id === appId);

      return json(res, 200, {
        id: appId,
        slug: project?.slug,
        started: dojo.data.started,
        ...(dojo.level ? { level: dojo.level } : {}),
      });
    }

    if (req.method === 'GET' && app?.[2] === 'source') {
      if (dojo.sourceReply) {
        return payloadError(res, dojo.sourceReply.status, dojo.sourceReply.message);
      }

      if (!dojo.source) return payloadError(res, 404, 'This app has nothing live to pull yet.');

      res.writeHead(200, { 'content-type': 'application/gzip' });
      res.end(dojo.source);

      return;
    }

    if (req.method === 'GET' && app?.[2] === 'logs') {
      if (dojo.logsStatus) {
        return payloadError(res, dojo.logsStatus, logsRefusals[dojo.logsStatus]);
      }

      const after = Number(url.searchParams.get('after') ?? 0);

      return json(res, 200, {
        lines: dojo.logs.slice(after),
        next: dojo.logs.length ? String(dojo.logs.length) : null,
      });
    }

    const editor = dojo.level === 'editor';

    if (app?.[2] === 'keys' && editor) {
      return payloadError(res, 403, "Only this app's owners can see or change its keys.");
    }

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
      const data = form?.get('data');

      dojo.data.sent.push(typeof data === 'string' ? data : undefined);

      if (data === 'false' && !dojo.data.started) {
        for (const key of dojo.data.bucket.keys()) {
          if (key.startsWith('.dojo/import/')) dojo.data.bucket.delete(key);
        }
      }

      if (typeof part === 'string') {
        const sealed = JSON.parse(part) as Parameters<typeof openKeys>[0] & {
          keyId: string;
          updateKeys?: boolean;
        };

        if (sealed.keyId !== 'seal-1') return payloadError(res, 400, 'Unknown sealing key.');

        const values = openKeys(sealed, dojo.sealingPrivateKey);

        if (editor && Object.keys(values).some((key) => key !== 'FROGBOT_SECRET')) {
          return payloadError(res, 403, "Only this app's owners can change its keys.");
        }

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

      if (status === 'ready') dojo.data.started = true;

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
