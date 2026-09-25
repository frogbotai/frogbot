import { isDeepStrictEqual } from 'node:util';

import type { MessageHandler, StateAdapter } from 'chat';
import type { z } from 'zod';

import { ChannelChat } from '../channels/chat.js';
import type { FrogBotRequest } from '../types/request.js';
import { pieceFactoryDefinition, pieceInstanceRuntime } from './definePiece.js';
import type {
  PieceActionDefinition,
  PieceDefinition,
  PieceFactory,
  PieceInstance,
  PieceOption,
  PieceTriggerDefinition,
} from './types.js';

type ConformanceError = string | RegExp;
type ConformanceExpectation = { result: unknown } | { error: ConformanceError };

type ConformanceAction = {
  slug: string;
  input: unknown;
  expect: ConformanceExpectation;
};

type ConformanceOptions = {
  action: string;
  field: string;
  input?: Record<string, unknown>;
  expect: PieceOption[];
};

type ConformanceTrigger = {
  slug: string;
  type: PieceTriggerDefinition['type'];
};

type ConformanceChannelRequest = {
  url?: string;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  data?: FrogBotRequest['data'];
};

type ConformanceChannel = {
  adapter: { name: string };
  identity: {
    author: Parameters<NonNullable<PieceDefinition['channel']>['identity']>[0]['author'];
    req: FrogBotRequest;
    expect: unknown;
  };
  webhook?: {
    state: StateAdapter;
    requests: Array<{
      request: ConformanceChannelRequest;
      verified: boolean;
      event?: string;
      handshake?: { status: number; body: string } | null;
      delivery: {
        status: number;
        body?: string;
        messages: ConformanceChannelMessage[];
      };
    }>;
  };
};

type ConformanceChannelMessage = {
  id: string;
  threadId: string;
  text: string;
  authorId: string;
};

export type PieceConformanceFixtures = {
  factoryOptions?: Record<string, unknown>;
  actions: ConformanceAction[];
  options?: ConformanceOptions[];
  triggers?: ConformanceTrigger[];
  oauth?: boolean;
  channel?: ConformanceChannel;
};

function fail(message: string): never {
  throw new Error(`[frogbot] Piece conformance: ${message}`);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) fail(message);
}

function assertUnique(slugs: string[], subject: string): void {
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) fail(`${subject} contains duplicate '${slug}'.`);
    seen.add(slug);
  }
}

function matchesError(error: unknown, expected: ConformanceError): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return typeof expected === 'string' ? message.includes(expected) : expected.test(message);
}

function channelRequest(fixture: ConformanceChannelRequest): FrogBotRequest & Request {
  const req = new Request(fixture.url ?? 'https://example.com/api/webhooks/conformance', {
    method: fixture.method ?? 'POST',
    headers: fixture.headers,
    body: fixture.body,
  }) as FrogBotRequest & Request;

  req.data = fixture.data;

  return req;
}

export async function pieceConformance<T extends PieceDefinition>(
  createPiece: PieceFactory<T>,
  fixtures: PieceConformanceFixtures,
): Promise<void> {
  const definition = pieceFactoryDefinition(createPiece);
  const actionSlugs = definition.actions.map(({ slug }) => slug);
  const fixtureSlugs = fixtures.actions.map(({ slug }) => slug);
  assertUnique(fixtureSlugs, 'Action fixtures');
  assertEqual(
    [...fixtureSlugs].sort(),
    [...actionSlugs].sort(),
    `action fixtures must cover exactly: ${actionSlugs.join(', ')}.`,
  );

  const factoryOptions = fixtures.factoryOptions ?? {};
  let instance: PieceInstance & Record<string, unknown>;
  try {
    const runtimeFactory = createPiece as (options: Record<string, unknown>) => typeof instance;
    instance = runtimeFactory(factoryOptions);
  } catch (error) {
    fail(`factory options are invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const configuredAuth = pieceInstanceRuntime(instance).auth;
  const req = {
    frogbot: {
      connections: {
        resolvePieceCredential: async () => ({ auth: configuredAuth, key: instance }),
      },
    },
    user: null,
  } as never;

  for (const fixture of fixtures.actions) {
    const action = instance[fixture.slug as keyof typeof instance];
    if (typeof action !== 'function') fail(`action '${fixture.slug}' is not callable.`);
    try {
      const result = await (action as (args: { input: unknown; req: never }) => Promise<unknown>)({
        input: fixture.input,
        req,
      });
      if ('error' in fixture.expect) {
        fail(
          `action '${fixture.slug}' resolved but expected error ${String(fixture.expect.error)}.`,
        );
      }
      assertEqual(
        result,
        fixture.expect.result,
        `action '${fixture.slug}' returned an unexpected result.`,
      );
    } catch (error) {
      if ('error' in fixture.expect && matchesError(error, fixture.expect.error)) continue;
      if ('error' in fixture.expect) {
        fail(
          `action '${fixture.slug}' threw '${error instanceof Error ? error.message : String(error)}', expected ${String(fixture.expect.error)}.`,
        );
      }
      throw error;
    }
  }

  const parsedOptions = definition.options
    ? definition.options.parse(
        Object.fromEntries(
          Object.entries(factoryOptions).filter(
            ([key]) => !['auth', 'oauth', 'slug'].includes(key),
          ),
        ),
      )
    : {};
  const client = await instance.client({ req });
  for (const fixture of fixtures.options ?? []) {
    const action = definition.actions.find(({ slug }) => slug === fixture.action) as
      PieceActionDefinition<z.ZodType, z.ZodType | undefined, unknown, unknown> | undefined;
    if (!action) fail(`options fixture references unknown action '${fixture.action}'.`);
    const callbacks = action.options as
      | Record<
          string,
          (args: {
            input: Record<string, unknown>;
            client: unknown;
            options: unknown;
            req: never;
          }) => Promise<PieceOption[]>
        >
      | undefined;
    const callback = callbacks?.[fixture.field];
    if (!callback) {
      fail(`action '${fixture.action}' has no options callback for '${fixture.field}'.`);
    }
    const result = await callback({
      input: fixture.input ?? {},
      client,
      options: parsedOptions,
      req,
    });
    assertEqual(
      result,
      fixture.expect,
      `action '${fixture.action}' options '${fixture.field}' returned unexpected choices.`,
    );
  }

  const declaredTriggers = (definition.triggers ?? []).map(({ slug, type }) => ({ slug, type }));
  assertUnique(
    (fixtures.triggers ?? []).map(({ slug }) => slug),
    'Trigger fixtures',
  );
  assertEqual(
    fixtures.triggers ?? [],
    declaredTriggers,
    `trigger fixtures must match declarations: ${declaredTriggers.map(({ slug, type }) => `${slug} (${type})`).join(', ')}.`,
  );

  const declaresOAuth = Boolean(definition.oauth);
  if ((fixtures.oauth ?? false) !== declaresOAuth) {
    fail(`OAuth declaration expected ${fixtures.oauth ?? false}, received ${declaresOAuth}.`);
  }

  if (!fixtures.channel) return;

  if (!definition.channel) fail('channel fixtures require a channel declaration.');

  let adapter;

  try {
    adapter = definition.channel.adapter({ auth: configuredAuth, options: parsedOptions });
  } catch (error) {
    fail(`channel adapter failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  assertEqual(
    adapter.name,
    fixtures.channel.adapter.name,
    'channel adapter has an unexpected name.',
  );

  const identity = await definition.channel.identity({
    author: fixtures.channel.identity.author,
    client,
    req: fixtures.channel.identity.req,
  });

  assertEqual(
    identity,
    fixtures.channel.identity.expect,
    'channel identity returned an unexpected result.',
  );

  if (!fixtures.channel.webhook) return;

  if (!definition.webhook) fail('channel webhook fixtures require a webhook declaration.');

  for (const fixture of fixtures.channel.webhook.requests) {
    if (!Array.isArray(fixture.delivery?.messages)) {
      fail(
        'channel webhook delivery requires expected messages, including an empty array for no dispatch.',
      );
    }
  }

  const chat = new ChannelChat({
    adapters: { [adapter.name]: adapter },
    state: fixtures.channel.webhook.state,
    userName: 'frogbot',
    logger: 'silent',
  });

  const messages: ConformanceChannelMessage[] = [];
  const receive: MessageHandler = async (thread, message) => {
    messages.push({
      id: message.id,
      threadId: thread.id,
      text: message.text,
      authorId: message.author.userId,
    });
  };

  chat.onNewMention(receive);
  chat.onNewMessage(/[\s\S]*/, receive);
  chat.onSubscribedMessage(receive);

  try {
    await chat.initialize();

    for (const fixture of fixtures.channel.webhook.requests) {
      if (definition.webhook.verify) {
        const verified = await definition.webhook.verify({
          req: channelRequest(fixture.request),
          options: parsedOptions,
        });

        assertEqual(
          verified,
          fixture.verified,
          'channel webhook verification returned an unexpected result.',
        );
      }

      if ('handshake' in fixture) {
        if (!definition.webhook.handshake) {
          fail('channel webhook fixture requires handshake behavior.');
        }

        const response = await definition.webhook.handshake({
          req: channelRequest(fixture.request),
          options: parsedOptions,
        });
        const actual = response ? { status: response.status, body: await response.text() } : null;

        assertEqual(
          actual,
          fixture.handshake,
          'channel webhook handshake returned an unexpected response.',
        );
      }

      if (fixture.event !== undefined) {
        if (!definition.webhook.parse) fail('channel webhook fixture requires parse behavior.');

        const parsed = definition.webhook.parse({ req: channelRequest(fixture.request) });

        assertEqual(parsed.event, fixture.event, 'channel webhook parsed an unexpected event.');
      }

      messages.length = 0;

      const tasks: Promise<unknown>[] = [];
      let response: Response;

      try {
        response = await chat.webhooks[adapter.name]!(channelRequest(fixture.request), {
          waitUntil: (task) => tasks.push(task),
        });
      } finally {
        while (tasks.length > 0) {
          await Promise.all(tasks.splice(0));
        }
      }

      assertEqual(
        response.status,
        fixture.delivery.status,
        `channel webhook returned status ${response.status}, expected ${fixture.delivery.status}.`,
      );

      if (!definition.webhook.verify) {
        assertEqual(
          ![401, 403].includes(response.status),
          fixture.verified,
          'channel adapter verification returned an unexpected result.',
        );
      }

      if (fixture.delivery.body !== undefined) {
        assertEqual(
          await response.text(),
          fixture.delivery.body,
          'channel webhook returned an unexpected body.',
        );
      }

      assertEqual(
        messages,
        fixture.delivery.messages,
        'channel webhook dispatched unexpected messages.',
      );
    }
  } finally {
    await chat.shutdown();
  }
}
