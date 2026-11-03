import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Adapter } from '../../../../packages/frogbot/node_modules/chat/dist/index.js';
import type {
  AgentConfig,
  AgentPieceTrigger,
  AgentSchedule,
} from '../../../../packages/frogbot/src/agents/types.js';
import {
  definePiece,
  pieceInstanceDefinition,
  pieceInstanceRuntime,
  pieceTriggerInstance,
} from '../../../../packages/frogbot/src/pieces/definePiece.js';
import type { PieceTriggerReference } from '../../../../packages/frogbot/src/pieces/types.js';
import { buildIngressRegistry } from '../../../../packages/frogbot/src/triggers/registry.js';
import { createEchoPiece } from './fixtures/createEchoPiece.js';

function isTriggerType<TType extends PieceTriggerReference['type']>(
  trigger: PieceTriggerReference,
  type: TType,
): trigger is Extract<PieceTriggerReference, { type: TType }> {
  return Reflect.get(Object(trigger), 'type') === type;
}

function subscription(trigger: PieceTriggerReference, input: unknown): AgentPieceTrigger {
  const handler = vi.fn();

  if (isTriggerType(trigger, 'app')) return { trigger, input, handler };
  if (isTriggerType(trigger, 'polling')) return { trigger, input, handler };

  return { trigger, input, handler };
}

function agent(trigger: PieceTriggerReference, slug = 'ops', input?: unknown): AgentConfig {
  return {
    slug,
    instructions: 'Handle events',
    triggers: [subscription(trigger, input)],
  };
}

function createPolling({ schedule }: { schedule?: string } = {}) {
  return definePiece({
    slug: 'polling',
    label: 'Polling',
    actions: [],
    triggers: [
      {
        slug: 'polled',
        type: 'polling',
        description: 'Polled',
        input: z.object({}),
        ...(schedule === undefined ? {} : { schedule }),
        run() {
          return Promise.resolve({ events: [] });
        },
      },
    ],
  })();
}

const createChannel = definePiece({
  slug: 'channel',
  label: 'Channel',
  actions: [],
  channel: {
    adapter: vi.fn<() => Adapter>(),
    identity() {
      return Promise.resolve(null);
    },
  },
  webhook: {
    verify() {
      return Promise.resolve(true);
    },
  },
  triggers: [
    {
      slug: 'received',
      type: 'app',
      event: 'received',
      description: 'Received',
      input: z.object({}),
      run() {
        return Promise.resolve([]);
      },
    },
  ],
});

describe('trigger ingress registry', () => {
  it('creates stable references owned by each factory instance', () => {
    const first = createEchoPiece({ slug: 'first', prefix: 'first: ' });
    const second = createEchoPiece({ slug: 'second', prefix: 'second: ' });

    expect(first.triggers.received).toBe(first.triggers.received);
    expect(first.triggers.received).not.toBe(second.triggers.received);
    expect(first.triggers.received).not.toBe(pieceInstanceDefinition(first).triggers![0]);
    expect(pieceTriggerInstance(first.triggers.received)).toBe(first);
    expect(pieceTriggerInstance(second.triggers.received)).toBe(second);
    expect(pieceTriggerInstance({ ...first.triggers.received })).toBeUndefined();
    expect(pieceTriggerInstance(undefined)).toBeUndefined();
    expect(pieceTriggerInstance(null)).toBeUndefined();
    expect(pieceTriggerInstance('received')).toBeUndefined();
  });

  it('discovers mounted instances without root registration and preserves the subscriber shape', () => {
    const instance = createEchoPiece({ prefix: 'echo: ' });
    const ops = agent(instance.triggers.received);
    const audit = agent(instance.triggers.received, 'audit');
    const registry = buildIngressRegistry({ agents: [ops, audit] });

    expect(Object.keys(registry)).toEqual(['echo']);
    expect(registry.echo.instance).toBe(instance);
    expect(registry.echo.subscribers).toEqual([
      { agentSlug: 'ops', piece: instance, trigger: ops.triggers![0], input: {} },
      { agentSlug: 'audit', piece: instance, trigger: audit.triggers![0], input: {} },
    ]);
  });

  it('resolves each instance even when the compatibility list contains only another instance', () => {
    const first = createEchoPiece({ slug: 'first', prefix: 'first: ' });
    const second = createEchoPiece({ slug: 'second', prefix: 'second: ' });
    const registry = buildIngressRegistry({
      instances: [first],
      agents: [agent(second.triggers.received, 'second'), agent(first.triggers.received, 'first')],
    });

    expect(registry.first.instance).toBe(first);
    expect(registry.second.instance).toBe(second);
    expect(registry.second.subscribers[0].piece).toBe(second);
    expect(pieceInstanceRuntime(registry.second.instance).options).toEqual({ prefix: 'second: ' });
  });

  it('rejects unowned references with the agent name instead of silently skipping them', () => {
    const instance = createEchoPiece({ prefix: '' });
    const references = [
      pieceInstanceDefinition(instance).triggers![0],
      { ...instance.triggers.received },
      undefined,
      null,
      'received',
    ];

    for (const reference of references) {
      expect(() =>
        buildIngressRegistry({
          instances: [instance],
          agents: [agent(reference as PieceTriggerReference)],
        }),
      ).toThrow(/unknown trigger reference.*agent 'ops'/i);
    }
  });

  it('rejects triggers on pieces without webhook support', () => {
    const instance = definePiece({
      slug: 'unsupported',
      label: 'Unsupported',
      actions: [],
      triggers: [
        {
          slug: 'created',
          type: 'app',
          event: 'created',
          description: 'Created',
          input: z.object({}),
          run() {
            return Promise.resolve([]);
          },
        },
      ],
    })();

    expect(() => buildIngressRegistry({ agents: [agent(instance.triggers.created)] })).toThrow(
      /Trigger 'created' in agent 'ops' requires a webhook-enabled piece/,
    );
  });

  it('registers subscribed webhook triggers without piece webhook support', () => {
    const instance = definePiece({
      slug: 'subscribed',
      label: 'Subscribed',
      actions: [],
      triggers: [
        {
          slug: 'received',
          type: 'webhook',
          description: 'Received',
          input: z.object({}),
          onEnable() {
            return Promise.resolve({ secret: 'persisted' });
          },
          async onDisable() {},
          run() {
            return Promise.resolve([]);
          },
        },
      ],
    })();

    const registry = buildIngressRegistry({ agents: [agent(instance.triggers.received)] });

    expect(registry.subscribed.subscribers).toHaveLength(1);
  });

  it('accepts polling mounts with the default five-minute cron', () => {
    const instance = createPolling();
    const ops = agent(instance.triggers.polled);
    const registry = buildIngressRegistry({ agents: [ops] });

    expect(registry.polling.subscribers).toEqual([
      {
        agentSlug: 'ops',
        piece: instance,
        trigger: ops.triggers![0],
        input: {},
        cron: '*/5 * * * *',
      },
    ]);
  });

  it.each([
    { name: 'mount every', schedule: { every: '1h' }, cron: '0 */1 * * *' },
    { name: 'mount cron', schedule: { cron: '15 * * * *' }, cron: '15 * * * *' },
    { name: 'trigger schedule', pieceSchedule: '*/10 * * * *', cron: '*/10 * * * *' },
  ] satisfies {
    name: string;
    schedule?: AgentSchedule;
    pieceSchedule?: string;
    cron: string;
  }[])('takes the cron from the $name', ({ schedule, pieceSchedule = '*/10 * * * *', cron }) => {
    const instance = createPolling({ schedule: pieceSchedule });
    const registry = buildIngressRegistry({
      agents: [
        {
          slug: 'ops',
          instructions: 'Handle events',
          triggers: [{ trigger: instance.triggers.polled, schedule, handler: vi.fn() }],
        },
      ],
    });

    expect(registry.polling.subscribers[0].cron).toBe(cron);
  });

  it.each([
    { schedule: { every: '7m' }, error: /Trigger 'polled' in agent 'ops'.*does not divide evenly/ },
    {
      schedule: { every: '0m' },
      error: /Trigger 'polled' in agent 'ops'.*Invalid schedule duration/,
    },
    {
      schedule: { cron: 'not a cron' },
      error: /Trigger 'polled' in agent 'ops' has an invalid cron expression: 'not a cron'/,
    },
    {
      schedule: { cron: '0 * * * *', timezone: 'Europe/London' },
      error: /Trigger 'polled' in agent 'ops' timezone is not yet supported/,
    },
    {
      schedule: { cron: '0 * * * *', every: '1h' },
      error: /Trigger 'polled' in agent 'ops' schedule requires exactly one of every or cron/,
    },
  ])('rejects the mount schedule $schedule at boot', ({ schedule, error }) => {
    const instance = createPolling();

    expect(() =>
      buildIngressRegistry({
        agents: [
          {
            slug: 'ops',
            instructions: 'Handle events',
            triggers: [
              {
                trigger: instance.triggers.polled,
                schedule: schedule as AgentSchedule,
                handler: vi.fn(),
              },
            ],
          },
        ],
      }),
    ).toThrow(error);
  });

  it("rejects a trigger's invalid cron at boot", () => {
    const instance = createPolling({ schedule: 'every five minutes' });

    expect(() => buildIngressRegistry({ agents: [agent(instance.triggers.polled)] })).toThrow(
      /Trigger 'polled' in agent 'ops' has an invalid cron expression: 'every five minutes'/,
    );
  });

  it('rejects a schedule on a webhook mount', () => {
    const instance = createEchoPiece({ prefix: '' });
    const trigger = {
      trigger: instance.triggers.subscribed,
      input: { channel: 'alerts' },
      schedule: { every: '1h' },
      handler: vi.fn(),
    };

    expect(() =>
      buildIngressRegistry({
        agents: [{ slug: 'ops', instructions: 'Handle events', triggers: [trigger as never] }],
      }),
    ).toThrow(
      /Trigger 'subscribed' in agent 'ops' sets a schedule, but only polling triggers take one/,
    );
  });

  it('asks unslugged polling instances for slugs without mentioning webhooks', () => {
    const first = createPolling();
    const second = createPolling();

    expect(() =>
      buildIngressRegistry({
        agents: [agent(first.triggers.polled), agent(second.triggers.polled, 'audit')],
      }),
    ).toThrow(
      /^\[frogbot\] Two Polling instances are mounted; give each a slug\. Ingress slug 'polling' is shared by agents 'ops' and 'audit'\.$/,
    );
  });

  it('rejects one polling trigger mounted twice in an agent', () => {
    const instance = createPolling();
    const mount = subscription(instance.triggers.polled, {});

    expect(() =>
      buildIngressRegistry({
        agents: [{ slug: 'ops', instructions: 'Handle events', triggers: [mount, mount] }],
      }),
    ).toThrow(/^\[frogbot\] Trigger 'polling\/polled' is mounted twice in agent 'ops'\./);

    expect(() =>
      buildIngressRegistry({
        agents: [agent(instance.triggers.polled), agent(instance.triggers.polled, 'audit')],
      }),
    ).not.toThrow();
  });

  it.each([undefined, null, {}, { channel: 42 }])('rejects invalid input %j at boot', (input) => {
    const instance = createEchoPiece({ prefix: '' });

    expect(() =>
      buildIngressRegistry({ agents: [agent(instance.triggers.subscribed, 'ops', input)] }),
    ).toThrow(/Trigger 'subscribed' in agent 'ops' has invalid input/);
  });

  it('applies schema defaults and transforms without mutating configured input', () => {
    const instance = definePiece({
      slug: 'parsed',
      label: 'Parsed',
      actions: [],
      webhook: {
        verify() {
          return Promise.resolve(true);
        },
      },
      triggers: [
        {
          slug: 'received',
          type: 'app',
          event: 'received',
          description: 'Received',
          input: z.object({ count: z.string().default('2').transform(Number) }),
          run() {
            return Promise.resolve([]);
          },
        },
      ],
    })();

    const input = { count: '3' };
    const registry = buildIngressRegistry({
      agents: [
        agent(instance.triggers.received),
        agent(instance.triggers.received, 'audit', input),
      ],
    });

    expect(registry.parsed.subscribers.map((subscriber) => subscriber.input)).toEqual([
      { count: 2 },
      { count: 3 },
    ]);
    expect(input).toEqual({ count: '3' });
    expect(() =>
      buildIngressRegistry({ agents: [agent(instance.triggers.received, 'ops', null)] }),
    ).toThrow(/invalid input/);
  });

  it('rejects two trigger instances sharing a slug and identifies both agents', () => {
    const first = createEchoPiece({ prefix: 'first' });
    const second = createEchoPiece({ prefix: 'second' });

    expect(() =>
      buildIngressRegistry({
        agents: [agent(first.triggers.received), agent(second.triggers.received, 'audit')],
      }),
    ).toThrow(/Two Echo instances receive webhooks; give each a slug.*ops.*audit/);
  });

  it('honors root schema defaults when input is omitted', () => {
    const instance = definePiece({
      slug: 'defaulted',
      label: 'Defaulted',
      actions: [],
      webhook: {
        verify() {
          return Promise.resolve(true);
        },
      },
      triggers: [
        {
          slug: 'received',
          type: 'app',
          event: 'received',
          description: 'Received',
          input: z.object({ channel: z.string() }).default({ channel: 'alerts' }),
          run() {
            return Promise.resolve([]);
          },
        },
      ],
    })();

    const registry = buildIngressRegistry({ agents: [agent(instance.triggers.received)] });

    expect(registry.defaulted.subscribers[0].input).toEqual({ channel: 'alerts' });
  });

  it.each([false, true])(
    'validates collisions between channel and trigger mounts (reverse %s)',
    (reverse) => {
      const channel = createChannel({ slug: 'shared' });
      const echo = createEchoPiece({ slug: 'shared', prefix: '' });
      const agents: AgentConfig[] = [
        { slug: 'support', instructions: '', channels: [channel] },
        agent(echo.triggers.received),
      ];

      expect(() => buildIngressRegistry({ agents: reverse ? agents.reverse() : agents })).toThrow(
        /shared.*support.*ops|shared.*ops.*support/,
      );
    },
  );

  it('validates slug collisions between channel-only mounts', () => {
    const first = createChannel();
    const second = createChannel();

    expect(() =>
      buildIngressRegistry({
        agents: [
          { slug: 'sales', instructions: '', channels: [first] },
          { slug: 'support', instructions: '', channels: [second] },
        ],
      }),
    ).toThrow(/Two Channel instances receive webhooks; give each a slug.*sales.*support/);
  });

  it('allows one instance mounted as a channel and as triggers on multiple agents', () => {
    const instance = createChannel();
    const registry = buildIngressRegistry({
      agents: [
        { ...agent(instance.triggers.received), channels: [instance] },
        agent(instance.triggers.received, 'audit'),
      ],
    });

    expect(registry.channel.subscribers.map((subscriber) => subscriber.agentSlug)).toEqual([
      'ops',
      'audit',
    ]);
  });

  it('ignores unmounted compatibility instances and schedule triggers', () => {
    expect(
      buildIngressRegistry({
        instances: [createEchoPiece({ prefix: '' }), createEchoPiece({ prefix: '' })],
        agents: [
          {
            slug: 'scheduled',
            instructions: '',
            triggers: [
              { type: 'schedule', slug: 'daily', schedule: { every: '1d' }, prompt: 'Run' },
            ],
          },
        ],
      }),
    ).toEqual({});
    expect(buildIngressRegistry({})).toEqual({});
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'supports URL-safe instance slug %s',
    (slug) => {
      const instance = createEchoPiece({ slug, prefix: '' });
      const registry = buildIngressRegistry({ agents: [agent(instance.triggers.received)] });

      expect(Object.keys(registry)).toEqual([slug]);
      expect(registry[slug].instance).toBe(instance);
      expect(registry[slug].subscribers).toHaveLength(1);
    },
  );
});
