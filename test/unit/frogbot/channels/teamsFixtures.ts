import { generateKeyPairSync, sign } from 'node:crypto';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { createServer, request as httpRequest } from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

import { vi } from 'vitest';

export const botAppId = 'bot-app-id';
export const botAppPassword = 'bot-app-password';
export const tenantId = 'tenant-1';

export type TeamsScope = 'channel' | 'groupChat' | 'personal';

export type TeamsMember = {
  id: string;
  name: string;
  aadObjectId?: string;
  email?: string;
  userPrincipalName?: string;
};

export type TeamsRequest = {
  method: string;
  path: string;
  conversationId?: string;
  activityId?: string;
  sentId?: string;
  targeted: boolean;
  body: TeamsActivityBody;
};

export type CardJSON = {
  version: string;
  body: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
};

export type TeamsActivityBody = Record<string, unknown> & {
  text?: string;
  recipient?: { id?: string };
  attachments?: Array<{ contentType: string; content: CardJSON }>;
};

export type TeamsServer = Awaited<ReturnType<typeof startTeamsServer>>;

export const members = {
  ada: {
    id: '29:ada',
    name: 'Ada Lovelace',
    aadObjectId: 'aad-ada',
    email: 'ada@example.com',
    userPrincipalName: 'ada@example.com',
  },
  grace: {
    id: '29:grace',
    name: 'Grace Hopper',
    aadObjectId: 'aad-grace',
    email: 'grace@example.com',
    userPrincipalName: 'grace@example.com',
  },
  mallory: {
    id: '29:mallory',
    name: 'Mallory',
    aadObjectId: 'aad-mallory',
    email: 'mallory@elsewhere.example',
    userPrincipalName: 'mallory@elsewhere.example',
  },
  guest: { id: '29:guest', name: 'Guest' },
} satisfies Record<string, TeamsMember>;

const conversations: Record<TeamsScope, (root: string) => Record<string, unknown>> = {
  channel: (root) => ({
    id: `19:general@thread.tacv2;messageid=${root}`,
    conversationType: 'channel',
    isGroup: true,
    tenantId,
  }),
  groupChat: () => ({
    id: '19:group-chat@thread.v2',
    conversationType: 'groupChat',
    isGroup: true,
    tenantId,
  }),
  personal: () => ({ id: 'a:personal-ada', conversationType: 'personal', tenantId }),
};

export async function startTeamsServer() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'teams-key', alg: 'RS256' };

  const requests: TeamsRequest[] = [];
  const unexpected: string[] = [];
  const roster = new Map<string, TeamsMember>(Object.values(members).map((m) => [m.id, m]));
  const failures: Array<{ method: string; status: number }> = [];
  let activityId = 1_700_000_000_000;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    const raw = await text(req);
    const path = decodeURIComponent(url.pathname);

    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (path === '/v1/.well-known/keys') return reply(200, { keys: [jwk] });

    if (path.endsWith('/.well-known/openid-configuration')) {
      const authority = `https://login.microsoftonline.com${path.split('/v2.0/')[0]}`;

      return reply(200, {
        issuer: `${authority}/v2.0`,
        authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
        token_endpoint: `${authority}/oauth2/v2.0/token`,
        end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
        jwks_uri: `${authority}/discovery/v2.0/keys`,
      });
    }

    if (path.endsWith('/oauth2/v2.0/token')) {
      return reply(200, { token_type: 'Bearer', expires_in: 3600, access_token: botToken() });
    }

    const match = /^\/v3\/conversations\/([^/]+)(?:\/(activities|members)(?:\/([^/]+))?)?$/.exec(
      path,
    );

    if (!match) {
      unexpected.push(`${req.method} ${path}`);

      return reply(404, { error: { code: 'NotFound' } });
    }

    const [, conversationId, collection, id] = match;

    const record: TeamsRequest = {
      method: req.method!,
      path,
      conversationId,
      ...(collection === 'activities' && id ? { activityId: id } : {}),
      targeted: url.searchParams.get('isTargetedActivity') === 'true',
      body: raw ? JSON.parse(raw) : {},
    };

    requests.push(record);

    const failure = failures.findIndex(({ method }) => method === req.method);

    if (failure !== -1) {
      const [{ status }] = failures.splice(failure, 1);

      return reply(status, { error: { code: 'Failure', message: `Injected ${status}` } });
    }

    if (collection === 'members') {
      const member = id ? roster.get(id) : undefined;

      return member ? reply(200, member) : reply(404, { error: { code: 'MemberNotFound' } });
    }

    if (req.method === 'PUT') return reply(200, { id });

    record.sentId = String(++activityId);

    return reply(201, { id: record.sentId });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const serviceUrl = `${url}/`;

  function botToken({ audience = botAppId } = {}) {
    const now = Math.floor(Date.now() / 1000);

    return jwt(
      { alg: 'RS256', typ: 'JWT', kid: jwk.kid },
      {
        iss: 'https://api.botframework.com',
        aud: audience,
        appid: botAppId,
        serviceurl: serviceUrl,
        nbf: now - 60,
        exp: now + 3600,
      },
    );
  }

  function jwt(header: object, payload: object) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode(header)}.${encode(payload)}`;

    return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), keys.privateKey).toString('base64url')}`;
  }

  function signed(
    activity: Record<string, unknown>,
    { audience, url: target = 'http://localhost/api/webhooks/teams' } = {} as {
      audience?: string;
      url?: string;
    },
  ) {
    return new Request(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${botToken({ audience })}`,
      },
      body: JSON.stringify(activity),
    });
  }

  function interceptLogin() {
    const nativeFetch = globalThis.fetch;
    const nativeRequest = https.request.bind(https);

    vi.stubGlobal('fetch', ((input: string | URL | Request, init?: RequestInit) => {
      const target = new URL(input instanceof Request ? input.url : input.toString());

      if (target.hostname !== 'login.microsoftonline.com') return nativeFetch(input, init);

      const local = `${url}${target.pathname}${target.search}`;

      return nativeFetch(input instanceof Request ? new Request(local, input) : local, init);
    }) as typeof fetch);

    vi.spyOn(https, 'request').mockImplementation(((
      options: RequestOptions,
      callback?: (response: IncomingMessage) => void,
    ): ClientRequest => {
      if (options.hostname !== 'login.botframework.com') {
        return nativeRequest(options, callback);
      }

      const { agent: _agent, ...rest } = options;

      return httpRequest({ ...rest, hostname: '127.0.0.1', port }, callback);
    }) as typeof https.request);
  }

  const posts = () => requests.filter(({ method }) => method === 'POST');

  return {
    url,
    serviceUrl,
    requests,
    unexpected,
    roster,
    botToken,
    signed,
    interceptLogin,
    fail: (method: 'GET' | 'POST' | 'PUT', status: number) => failures.push({ method, status }),
    assertExpected() {
      if (unexpected.length) throw new Error(`Unexpected Teams requests: ${unexpected.join(', ')}`);
    },
    reset() {
      requests.length = 0;
      unexpected.length = 0;
      failures.length = 0;
    },
    cards: () =>
      posts().filter(({ body, targeted }) => !targeted && Array.isArray(body.attachments)),
    updates: () => requests.filter(({ method }) => method === 'PUT'),
    targeted: () => posts().filter(({ targeted }) => targeted),
    texts: () =>
      posts()
        .filter(({ body, targeted }) => !targeted && typeof body.text === 'string')
        .map(({ body }) => body.text as string),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export function cardOf(request: TeamsRequest | undefined) {
  return request?.body.attachments?.[0]?.content;
}

export function textRuns(body: Array<Record<string, unknown>> = []) {
  return body.flatMap(({ type, inlines }) =>
    type === 'RichTextBlock' ? (inlines as Array<Record<string, unknown>>) : [],
  );
}

export function cardInputs(request: TeamsRequest | undefined) {
  return (cardOf(request)?.body ?? []).filter(({ type }) => String(type).startsWith('Input.'));
}

export function teamsActivity({
  from = members.ada,
  id,
  root = '1000',
  scope = 'channel',
  serviceUrl,
  ...rest
}: {
  from?: TeamsMember;
  id: string;
  root?: string;
  scope?: TeamsScope;
  serviceUrl: string;
} & Record<string, unknown>) {
  return {
    type: 'message',
    id,
    timestamp: new Date().toISOString(),
    serviceUrl,
    channelId: 'msteams',
    from: {
      id: from.id,
      name: from.name,
      ...(from.aadObjectId ? { aadObjectId: from.aadObjectId } : {}),
    },
    recipient: { id: `28:${botAppId}`, name: 'FrogBot' },
    conversation: conversations[scope](root),
    channelData: {
      tenant: { id: tenantId },
      ...(scope === 'channel'
        ? { team: { id: '19:team@thread.tacv2' }, channel: { id: '19:general@thread.tacv2' } }
        : {}),
    },
    ...rest,
  };
}

export function mentionActivity({
  text: message = 'Paint the fence',
  ...options
}: Parameters<typeof teamsActivity>[0] & { text?: string }) {
  return teamsActivity({
    ...options,
    text: `<at>FrogBot</at> ${message}`,
    entities: [
      {
        type: 'mention',
        text: '<at>FrogBot</at>',
        mentioned: { id: `28:${botAppId}`, name: 'FrogBot' },
      },
    ],
  });
}

export function submitActivity({
  action = 'submit',
  card,
  id = `submit-${Math.random().toString(36).slice(2)}`,
  toolCallId,
  values = {},
  ...options
}: Omit<Parameters<typeof teamsActivity>[0], 'id'> & {
  action?: 'submit' | 'dismiss';
  card?: string;
  id?: string;
  toolCallId: string;
  values?: Record<string, string>;
}) {
  return teamsActivity({
    id,
    ...options,
    ...(card ? { replyToId: card } : {}),
    value: { actionId: `frogbot.question.${action}`, value: toolCallId, ...values },
  });
}

export function memoryState() {
  const values = new Map<string, unknown>();

  return {
    values,
    get: vi.fn(async (key: string) => (values.get(key) ?? null) as never),
    set: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}
