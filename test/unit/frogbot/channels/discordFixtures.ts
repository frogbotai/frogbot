import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { text } from 'node:stream/consumers';

export type DiscordCall = {
  method: string;
  path: string;
  body: Record<string, unknown>;
  id?: string;
};

type DiscordUser = { id: string; username?: string; global_name?: string };

const DISCORD_EPOCH = 1_420_070_400_000n;

export const discordBotToken = 'discord-bot-token';
export const discordApplicationId = '100000000000000001';

const keys = generateKeyPairSync('ed25519');

export const discordPublicKey = keys.publicKey
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('hex');

let sequence = 0;

export function snowflake(ms = Date.now()): string {
  sequence = (sequence + 1) & 0x3fffff;

  return String(((BigInt(ms) - DISCORD_EPOCH) << 22n) | BigInt(sequence));
}

export function discordUser(id: string): DiscordUser {
  return { id, username: `user-${id.toLowerCase()}`, global_name: `User ${id}` };
}

export function signedInteraction({
  body,
  url = 'http://localhost/webhook',
  valid = true,
}: {
  body: Record<string, unknown>;
  url?: string;
  valid?: boolean;
}): Request {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + raw), keys.privateKey).toString('hex');

  return new Request(url, {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-signature-timestamp': timestamp,
      'x-signature-ed25519': valid ? signature : '0'.repeat(128),
    },
  });
}

export function componentClick({
  customId,
  guildId = 'G1',
  id = snowflake(),
  messageId,
  parentId = 'C1',
  threadId = 'T1',
  user = 'U2',
  values,
}: {
  customId: string;
  guildId?: string | null;
  id?: string;
  messageId: string;
  parentId?: string | null;
  threadId?: string;
  user?: string;
  values?: string[];
}): Record<string, unknown> {
  const person = discordUser(user);

  return {
    type: 3,
    id,
    application_id: discordApplicationId,
    token: `interaction-token-${id}`,
    version: 1,
    channel_id: threadId,
    channel: parentId ? { id: threadId, type: 11, parent_id: parentId } : { id: threadId, type: 1 },
    ...(guildId ? { guild_id: guildId, member: { user: person } } : { user: person }),
    message: { id: messageId, channel_id: threadId },
    data: {
      custom_id: customId,
      component_type: values ? 3 : 2,
      ...(values ? { values } : {}),
    },
  };
}

export function gatewayMessage({
  content,
  guildId = 'G1',
  id = snowflake(),
  mention = false,
  parentId = 'C1',
  starter = false,
  threadId = 'T1',
  timestamp = new Date().toISOString(),
  user = 'U1',
}: {
  content: string;
  guildId?: string | null;
  id?: string;
  mention?: boolean;
  parentId?: string | null;
  starter?: boolean;
  threadId?: string;
  timestamp?: string;
  user?: string;
}): Record<string, unknown> {
  const location = !parentId
    ? { channel_id: threadId, channel_type: 1 }
    : starter
      ? { channel_id: threadId, channel_type: 11, thread: { id: threadId, parent_id: parentId } }
      : { channel_id: threadId, channel_type: 11 };

  return {
    type: 'GATEWAY_MESSAGE_CREATE',
    timestamp,
    data: {
      id,
      ...location,
      ...(guildId ? { guild_id: guildId } : {}),
      author: { ...discordUser(user), bot: false },
      content,
      timestamp,
      mentions: mention ? [{ id: discordApplicationId, username: 'frogbot', bot: true }] : [],
      mention_roles: [],
      mention_everyone: false,
      attachments: [],
      is_mention: mention,
    },
  };
}

export function forwardedGateway({
  body,
  url = 'http://localhost/webhook',
}: {
  body: Record<string, unknown>;
  url?: string;
}): Request {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-discord-gateway-token': discordBotToken },
  });
}

export async function startDiscordApi() {
  const calls: DiscordCall[] = [];
  const parents = new Map<string, string>([
    ['T1', 'C1'],
    ['P1', 'F1'],
  ]);
  const failures = new Map<string, { status: number; message: string }>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v10/, '');
    const raw = await text(req);
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const method = req.method!;
    const failure = failures.get(`${method} ${path}`);
    const call: DiscordCall = { method, path, body };

    calls.push(call);

    const reply = (status: number, value: Record<string, unknown>) => {
      if (typeof value.id === 'string') call.id = value.id;

      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };

    if (failure) return reply(failure.status, { message: failure.message, code: 0 });

    const channel = /^\/channels\/([^/]+)$/.exec(path);

    if (method === 'GET' && channel) {
      const id = channel[1]!;

      return reply(200, { id, type: 11, parent_id: parents.get(id) ?? null });
    }

    const thread = /^\/channels\/([^/]+)\/messages\/([^/]+)\/threads$/.exec(path);

    if (method === 'POST' && thread) {
      const id = snowflake();

      parents.set(id, thread[1]!);

      return reply(201, { id, parent_id: thread[1], name: body.name });
    }

    const messages = /^\/channels\/([^/]+)\/messages(?:\/([^/]+))?$/.exec(path);

    if (messages && (method === 'POST' || method === 'PATCH')) {
      return reply(200, { id: messages[2] ?? snowflake(), channel_id: messages[1], ...body });
    }

    return reply(200, {});
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v10`;

  return {
    url,
    calls,
    failures,
    parents,
    cards: (channelId: string) =>
      calls.filter(
        ({ method, path, body }) =>
          method === 'POST' && path === `/channels/${channelId}/messages` && body.flags === 32768,
      ),
    edits: (channelId: string, messageId: string) =>
      calls.filter(
        ({ method, path }) =>
          method === 'PATCH' && path === `/channels/${channelId}/messages/${messageId}`,
      ),
    reset: () => {
      calls.length = 0;
      failures.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export type DiscordApi = Awaited<ReturnType<typeof startDiscordApi>>;
