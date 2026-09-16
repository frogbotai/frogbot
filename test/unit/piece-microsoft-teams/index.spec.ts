import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createMicrosoftTeams,
  defineMicrosoftTeams,
  microsoftTeamsActions,
  microsoftTeamsScopes,
  microsoftTeamsTriggers,
} from '../../../packages/pieces/piece-microsoft-teams/src/index.js';
import { microsoftTeamsWebhookEvent } from '../../../packages/pieces/piece-microsoft-teams/src/webhook.js';
import { conformanceChannelState } from '../frogbot/pieces/channelState.js';

const auth = {
  accessToken: 'stored-access-token',
  cloud: 'login.microsoftonline.com',
  tenantId: 'common',
};
const botAuth = {
  ...auth,
  appId: 'bot-app-id',
  appPassword: 'bot-app-password',
};
const messageActivity = JSON.parse(
  readFileSync(new URL('./fixtures/message.json', import.meta.url), 'utf8'),
);
const adaptiveCardAction = JSON.parse(
  readFileSync(new URL('./fixtures/adaptive-card-action.json', import.meta.url), 'utf8'),
);
const calls: { url: string; init?: RequestInit }[] = [];
let transport: (url: string, init?: RequestInit) => Promise<Response>;

const team = { id: 'team', displayName: 'Team' };
const channel = {
  id: 'channel',
  displayName: 'Channel',
  createdDateTime: '2026-09-13T10:00:00Z',
};
const chat = {
  id: 'chat',
  chatType: 'oneOnOne',
  createdDateTime: '2026-09-13T10:00:00Z',
};
const member = { id: 'member', displayName: 'Member', email: 'member@example.com' };
const message = {
  id: 'message',
  createdDateTime: '2026-09-13T10:00:00Z',
  body: { content: 'Hello', contentType: 'text' },
};
const transcript = { id: 'transcript', createdDateTime: '2026-09-13T09:00:00Z' };
const recording = { id: 'recording', createdDateTime: '2026-09-13T09:30:00Z' };

function json(value: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function req(credential = auth) {
  return {
    frogbot: {
      connections: {
        resolvePieceCredential: vi.fn().mockResolvedValue({ auth: credential, key: {} }),
      },
    },
    user: null,
  };
}

function body(call: { init?: RequestInit } | undefined) {
  return JSON.parse(String(call?.init?.body));
}

function graphFixture(url: string, init?: RequestInit): Promise<Response> {
  const target = new URL(url);
  const method = init?.method ?? 'GET';

  if (target.pathname === '/v1.0/me') {
    return Promise.resolve(json({ id: 'me', displayName: 'Test User', mail: 'test@example.com' }));
  }

  if (target.pathname === '/v1.0/me/joinedTeams') {
    return Promise.resolve(
      json(
        target.searchParams.has('page')
          ? { value: [] }
          : {
              value: [team],
              '@odata.nextLink': `${target.origin}/v1.0/me/joinedTeams?page=2`,
            },
      ),
    );
  }

  if (target.pathname.endsWith('/members')) return Promise.resolve(json({ value: [member] }));

  if (target.pathname.endsWith('/allChannels')) return Promise.resolve(json({ value: [channel] }));

  if (target.pathname.endsWith('/channels')) {
    return Promise.resolve(json(method === 'POST' ? channel : { value: [channel] }));
  }

  if (target.pathname === '/v1.0/chats') {
    return Promise.resolve(json(method === 'POST' ? chat : { value: [chat] }));
  }

  if (target.pathname.endsWith('/softDelete')) return Promise.resolve(json(null, 204));

  if (target.pathname.endsWith('/content')) {
    return Promise.resolve(new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nHello'));
  }

  if (target.pathname.endsWith('/transcripts/transcript')) return Promise.resolve(json(transcript));
  if (target.pathname.endsWith('/transcripts')) {
    return Promise.resolve(json({ value: [transcript] }));
  }
  if (target.pathname.endsWith('/recordings/recording')) return Promise.resolve(json(recording));
  if (target.pathname.endsWith('/recordings')) return Promise.resolve(json({ value: [recording] }));

  if (target.pathname === '/v1.0/me/onlineMeetings') {
    return Promise.resolve(json({ value: [{ id: 'meeting' }] }));
  }

  if (target.pathname.includes('/messages')) return Promise.resolve(json(message));

  if (target.pathname === '/v1.0/teams/custom') return Promise.resolve(json({ ok: true }, 201));

  return Promise.resolve(json({ error: `Unhandled ${method} ${target.pathname}` }, 404));
}

beforeEach(() => {
  calls.length = 0;
  transport = graphFixture;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);

      calls.push({ url, init });

      return transport(url, init);
    }),
  );
});

describe('native Microsoft Teams OAuth', () => {
  it('binds commercial common OAuth, stored auth, account lookup, and Graph transport', async () => {
    const piece = createMicrosoftTeams({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const definition = pieceFactoryDefinition(createMicrosoftTeams);

    expect(definition.oauth).toMatchObject({
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: microsoftTeamsScopes,
    });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'stored-access-token' } })).toEqual(
      auth,
    );
    expect(z.toJSONSchema(definition.auth).properties?.accessToken).toMatchObject({ secret: true });

    const account = await definition.oauth?.account?.({
      tokens: { access_token: 'stored-access-token' },
      client: await piece.client({ req: req() }),
      req: req(),
    });

    expect(account).toEqual({ id: 'me', label: 'Test User', email: 'test@example.com' });
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: 'Bearer stored-access-token' });
  });

  it('binds tenant and US Government settings to both OAuth endpoints and stored client auth', async () => {
    const createGovernmentTeams = defineMicrosoftTeams({
      cloud: 'usGovernment',
      tenantId: 'contoso.onmicrosoft.com',
    });
    const piece = createGovernmentTeams({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const definition = pieceFactoryDefinition(createGovernmentTeams);
    const stored = definition.oauth?.toAuth?.({ tokens: { access_token: 'government-token' } });

    expect(definition.oauth).toMatchObject({
      authorizationUrl:
        'https://login.microsoftonline.us/contoso.onmicrosoft.com/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.us/contoso.onmicrosoft.com/oauth2/v2.0/token',
    });
    expect(stored).toEqual({
      accessToken: 'government-token',
      cloud: 'login.microsoftonline.us',
      tenantId: 'contoso.onmicrosoft.com',
    });

    transport = async () => json({ id: 'me', displayName: 'Government', mail: 'gov@example.us' });

    await piece
      .client({ req: req(stored) })
      .then((client) => client.request('/v1.0/me', z.object({ id: z.string() })));

    expect(calls[0]?.url).toBe('https://graph.microsoft.us/v1.0/me');
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: 'Bearer government-token' });
  });
});

describe('native Microsoft Teams channel', () => {
  it('creates the official adapter from Azure Bot credentials and rejects missing credentials', () => {
    const definition = pieceFactoryDefinition(createMicrosoftTeams);
    const adapter = definition.channel?.adapter({
      auth: botAuth,
      options: {
        botAppType: 'MultiTenant',
        botUsername: 'frogbot',
      },
    });

    expect(adapter?.name).toBe('teams');
    expect(() =>
      definition.channel?.adapter({
        auth,
        options: { botAppType: 'MultiTenant', botUsername: 'frogbot' },
      }),
    ).toThrow('require Azure Bot');
  });

  it('passes shared conformance with adapter-owned Bot Framework authentication denial', async () => {
    const definition = pieceFactoryDefinition(createMicrosoftTeams);
    const body = JSON.stringify(messageActivity);

    const result = await pieceConformance(createMicrosoftTeams, {
      factoryOptions: { auth: botAuth, botUsername: 'frogbot' },
      actions: microsoftTeamsActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
      triggers: definition.triggers?.map(({ slug, type }) => ({ slug, type })),
      oauth: true,
      channel: {
        adapter: { name: 'teams' },
        identity: {
          author: { userId: '29:user' },
          req: {} as never,
          expect: null,
        },
        webhook: {
          state: conformanceChannelState(),
          requests: [undefined, 'Bearer invalid.jwt.token'].map((authorization) => ({
            request: {
              url: 'https://frogbot.test/api/webhooks/teams',
              headers: {
                'content-type': 'application/json',
                ...(authorization ? { authorization } : {}),
              },
              body,
              data: messageActivity,
            },
            verified: false,
            event: 'messageReceived',
            delivery: { status: 401, messages: [] },
          })),
        },
      },
    });

    expect(result).toBeUndefined();
  });

  it('matches adapter-resolved AAD email identity to the FrogBot user collection', async () => {
    const definition = pieceFactoryDefinition(createMicrosoftTeams);
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 'user', email: 'ada@example.com' }] });
    const request = {
      frogbot: {
        config: Promise.resolve({
          _internal: { payloadConfig: Promise.resolve({ admin: { user: 'users' } }) },
        }),
        find,
      },
    };

    const identity = await definition.channel?.identity({
      author: { userId: '29:user', email: 'ADA@example.com' },
      client: {} as never,
      req: request as never,
    });

    expect(identity).toEqual({ id: 'user', email: 'ada@example.com', collection: 'users' });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'ada@example.com' } } }),
    );
  });

  it('maps recorded message and Adaptive Card activities to native events', () => {
    expect(microsoftTeamsWebhookEvent(messageActivity)).toBe('messageReceived');
    expect(microsoftTeamsWebhookEvent(adaptiveCardAction)).toBe('cardActionReceived');
  });

  it('emits Activity triggers only with a stable nonempty Activity ID', async () => {
    const piece = createMicrosoftTeams({ auth: botAuth });
    const client = await piece.client({ req: req(botAuth) });
    const run = (data: unknown) =>
      piece.triggers.messageReceived.run({
        client,
        input: {},
        options: { botAppType: 'MultiTenant', botUsername: 'bot' },
        req: { ...req(botAuth), data } as never,
      });

    await expect(run(messageActivity)).resolves.toEqual([
      { data: messageActivity, dedupeKey: 'activity-message-1' },
    ]);
    await expect(run({ ...messageActivity, id: '   ' })).resolves.toEqual([]);
    await expect(run({ ...messageActivity, id: undefined })).resolves.toEqual([]);
  });
});

describe('native Microsoft Teams actions', () => {
  it('declares fourteen actions, polling and Activity triggers, and meaningful schemas', () => {
    const piece = createMicrosoftTeams({ auth });
    const definition = pieceFactoryDefinition(createMicrosoftTeams);

    expect(pieceInstanceTools(piece)?.map((action) => action.slug)).toEqual(
      microsoftTeamsActions.map((slug) => `microsoft-teams_${slug}`),
    );
    expect(Object.keys(piece.triggers)).toEqual(microsoftTeamsTriggers);

    for (const action of definition.actions) {
      expect(z.toJSONSchema(action.input).type).toBe('object');
      expect(action.output).toBeDefined();
    }
  });

  it('executes every message, channel, chat, lookup, delete, and custom action', async () => {
    const piece = createMicrosoftTeams({ auth });
    const request = req();

    await expect(
      piece.createChannel({
        input: { teamId: 'team', channelDisplayName: 'Channel' },
        req: request,
      }),
    ).resolves.toEqual(channel);
    await expect(
      piece.createPrivateChannel({
        input: { teamId: 'team', channelDisplayName: 'Private' },
        req: request,
      }),
    ).resolves.toEqual(channel);
    await expect(
      piece.sendChannelMessage({
        input: { teamId: 'team', channelId: 'channel', content: 'Hello' },
        req: request,
      }),
    ).resolves.toEqual(message);
    await expect(
      piece.sendChatMessage({
        input: { chatId: 'chat', content: 'Hello', contentType: 'html' },
        req: request,
      }),
    ).resolves.toEqual(message);
    await expect(
      piece.replyToChannelMessage({
        input: { teamId: 'team', channelId: 'channel', messageId: 'message', content: 'Reply' },
        req: request,
      }),
    ).resolves.toEqual(message);
    await expect(
      piece.createChatAndSendMessage({
        input: { teamId: 'team', members: ['member'], content: 'Hello' },
        req: request,
      }),
    ).resolves.toEqual({ chat, message });
    await expect(
      piece.getChatMessage({
        input: { chatId: 'chat', messageId: 'message' },
        req: request,
      }),
    ).resolves.toEqual(message);
    await expect(
      piece.deleteChatMessage({
        input: { chatId: 'chat', messageId: 'message' },
        req: request,
      }),
    ).resolves.toEqual({ success: true, messageId: 'message', chatId: 'chat' });
    await expect(
      piece.getChannelMessage({
        input: { teamId: 'team', channelId: 'channel', messageId: 'message', replyId: 'reply' },
        req: request,
      }),
    ).resolves.toEqual(message);
    await expect(
      piece.findChannel({
        input: { teamId: 'team', channelName: "Leader's room" },
        req: request,
      }),
    ).resolves.toEqual({ found: true, result: [channel] });
    await expect(
      piece.findTeamMember({
        input: { teamId: 'team', searchBy: 'email', searchValue: "member's@example.com" },
        req: request,
      }),
    ).resolves.toEqual({ found: true, result: [member] });
    await expect(
      piece.customApiCall({
        input: { method: 'POST', path: '/v1.0/teams/custom', body: { enabled: true } },
        req: request,
      }),
    ).resolves.toEqual({ status: 201, body: { ok: true } });

    expect(calls.every((call) => call.init?.headers && 'authorization' in call.init.headers)).toBe(
      true,
    );
    expect(calls.some((call) => JSON.stringify(body(call)).includes('membershipType'))).toBe(true);
    expect(calls.some((call) => call.url.includes('Leader%27%27s'))).toBe(true);
    expect(calls.some((call) => call.url.includes('member%27%27s%40example.com'))).toBe(true);
  });

  it('paginates every dynamic option family', async () => {
    const piece = createMicrosoftTeams({ auth });
    const definition = pieceFactoryDefinition(createMicrosoftTeams);
    const client = await piece.client({ req: req() });
    const create = definition.actions.find((action) => action.slug === 'createChannel');
    const send = definition.actions.find((action) => action.slug === 'sendChannelMessage');
    const createChat = definition.actions.find(
      (action) => action.slug === 'createChatAndSendMessage',
    );
    const sendChat = definition.actions.find((action) => action.slug === 'sendChatMessage');
    const context = { client, options: {}, req: req() };

    await expect(create?.options?.teamId?.({ ...context, input: {} })).resolves.toEqual([
      { label: 'Team', value: 'team' },
    ]);
    await expect(
      send?.options?.channelId?.({ ...context, input: { teamId: 'team' } }),
    ).resolves.toEqual([{ label: 'Channel', value: 'channel' }]);
    await expect(
      createChat?.options?.members?.({ ...context, input: { teamId: 'team' } }),
    ).resolves.toEqual([{ label: 'Member', value: 'member' }]);
    await expect(sendChat?.options?.chatId?.({ ...context, input: {} })).resolves.toEqual([
      { label: 'chat', value: 'chat' },
    ]);

    expect(calls.filter((call) => call.url.includes('/joinedTeams'))).toHaveLength(2);
  });

  it('handles transcript text/list modes, recording item/list modes, and meeting resolution', async () => {
    const piece = createMicrosoftTeams({ auth });
    const request = req();

    await expect(
      piece.getMeetingTranscript({
        input: {
          meetingIdentifierType: 'joinWebUrl',
          meetingIdentifierValue: 'https://teams.microsoft.com/meet/123',
        },
        req: request,
      }),
    ).resolves.toEqual({ value: [transcript] });
    await expect(
      piece.getMeetingTranscript({
        input: {
          meetingIdentifierType: 'meetingId',
          meetingIdentifierValue: 'meeting',
          transcriptId: 'transcript',
        },
        req: request,
      }),
    ).resolves.toEqual({ content: 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello' });
    await expect(
      piece.getMeetingRecording({
        input: { meetingIdentifierType: 'joinMeetingId', meetingIdentifierValue: '123' },
        req: request,
      }),
    ).resolves.toEqual({ value: [recording] });
    await expect(
      piece.getMeetingRecording({
        input: {
          meetingIdentifierType: 'meetingId',
          meetingIdentifierValue: 'meeting',
          recordingId: 'recording',
        },
        req: request,
      }),
    ).resolves.toEqual(recording);

    expect(calls.filter((call) => call.url.includes('/onlineMeetings?'))).toHaveLength(2);
    expect(calls.some((call) => call.init?.headers && 'accept' in call.init.headers)).toBe(true);
  });

  it('rejects cross-origin custom API calls before transport', async () => {
    const piece = createMicrosoftTeams({ auth });

    await expect(
      piece.customApiCall({
        input: { method: 'GET', path: 'https://example.com/steal' },
        req: req(),
      }),
    ).rejects.toThrow('must target Microsoft Graph');
    expect(calls).toEqual([]);
  });
});

describe('native Microsoft Teams polling', () => {
  it('runs initial and subsequent channel and chat creation polls', async () => {
    const piece = createMicrosoftTeams({ auth });
    const request = req();
    const client = await piece.client({ req: request });

    const firstChannel = await piece.triggers.channelCreated.run({
      client,
      input: { teamId: 'team' },
      options: {},
      req: request,
    });
    const nextChannel = await piece.triggers.channelCreated.run({
      client,
      input: { teamId: 'team' },
      options: {},
      req: request,
      cursor: firstChannel.cursor,
    });
    const firstChat = await piece.triggers.chatCreated.run({
      client,
      input: {},
      options: {},
      req: request,
    });
    const nextChat = await piece.triggers.chatCreated.run({
      client,
      input: {},
      options: {},
      req: request,
      cursor: firstChat.cursor,
    });

    expect(firstChannel.events).toEqual([channel]);
    expect(nextChannel.events).toEqual([]);
    expect(firstChat.events).toEqual([chat]);
    expect(nextChat.events).toEqual([]);
    expect(calls.some((call) => call.url.includes('%24filter=createdDateTime'))).toBe(true);
    expect(calls.some((call) => call.url.includes('%24top=10'))).toBe(true);
  });

  it.each([
    [
      'channelMessageCreated',
      { teamId: 'team', channelId: 'channel' },
      '/teams/team/channels/channel/messages',
    ],
    ['chatMessageCreated', { chatId: 'chat' }, '/chats/chat/messages'],
  ])(
    'runs initial and multipage resumed delta polling for %s',
    async (triggerName, input, root) => {
      const piece = createMicrosoftTeams({ auth });
      const request = req();
      const client = await piece.client({ req: request });
      const trigger = piece.triggers[triggerName];

      transport = async (url) => {
        const target = new URL(url);

        if (!target.pathname.endsWith('/delta') && !target.searchParams.has('page')) {
          return json({ value: [message] });
        }

        if (target.searchParams.get('page') === '2') {
          return json({
            value: [{ ...message, id: 'newer', createdDateTime: '2026-09-13T12:00:00Z' }],
            '@odata.deltaLink': `${target.origin}/v1.0${root}/delta?$deltatoken=next`,
          });
        }

        return json({
          value: [{ ...message, id: 'new', createdDateTime: '2026-09-13T11:00:00Z' }],
          '@odata.nextLink': `${target.origin}/v1.0${root}/delta?page=2`,
        });
      };

      const first = await trigger.run({ client, input, options: {}, req: request });
      const resumed = await trigger.run({
        client,
        input,
        options: {},
        req: request,
        cursor: {
          since: '2026-09-13T10:30:00Z',
          deltaLink: `https://graph.microsoft.com/v1.0${root}/delta?$deltatoken=stored`,
        },
      });

      expect(first.events).toEqual([message]);
      expect(resumed.events.map((event) => event.id)).toEqual(['new', 'newer']);
      expect(resumed.cursor).toEqual({
        since: '2026-09-13T12:00:00Z',
        deltaLink: `https://graph.microsoft.com/v1.0${root}/delta?$deltatoken=next`,
      });
      expect(calls.some((call) => call.url.includes('$deltatoken=stored'))).toBe(true);
      expect(calls.some((call) => call.url.includes('page=2'))).toBe(true);
    },
  );
});
