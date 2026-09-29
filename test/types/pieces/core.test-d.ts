import {
  createPieceHelpers as rootCreatePieceHelpers,
  type FrogBotRequest,
  type TriggerEvent,
} from 'frogbot';
import {
  createPieceHelpers,
  definePiece,
  type FrogBotRequest as PieceFrogBotRequest,
  type PieceActionDefinition,
  type PieceAppTrigger,
  type PieceDefinition,
  type PieceHelpers,
  type PieceJSON,
  type TriggerEvent as PieceTriggerEvent,
} from 'frogbot/pieces';
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

type Mailer = {
  labels(): Promise<string[]>;
  send(message: { to: string[]; subject: string }): Promise<{ id: string }>;
  subscribe(url: string): Promise<{ hookId: string; secret: string }>;
};

type MailerOptions = { region: string };

type MailerTypes = {
  auth: undefined;
  options: MailerOptions;
  actions: {
    send: { input: { to: string[]; subject: string }; output: { id: string } };
  };
  triggers: Record<string, never>;
};

type HookState = { hookId: string; secret: string };

declare const req: FrogBotRequest;

const { defineAction, defineAppTrigger, definePollingTrigger, defineWebhookTrigger } =
  createPieceHelpers<Mailer, MailerOptions>();

const send = defineAction({
  slug: 'send',
  description: 'Send a message.',
  input: z.object({ to: z.array(z.string()), subject: z.string() }),
  output: z.object({ id: z.string() }),
  options: {
    async to({ client, input, options }) {
      expectTypeOf(client).toEqualTypeOf<Mailer>();
      expectTypeOf(input).toEqualTypeOf<Partial<{ to: string[]; subject: string }>>();
      expectTypeOf(options).toEqualTypeOf<MailerOptions>();

      const labels = await client.labels();

      return labels.map((label) => ({ label, value: label }));
    },
  },
  async run({ client, input, options, req }) {
    expectTypeOf(client).toEqualTypeOf<Mailer>();
    expectTypeOf(input).toEqualTypeOf<{ to: string[]; subject: string }>();
    expectTypeOf(options).toEqualTypeOf<MailerOptions>();
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return client.send(input);
  },
});

const listLabels = defineAction({
  slug: 'listLabels',
  description: 'List labels.',
  input: z.object({ prefix: z.string().optional() }),
  async run({ client, input }) {
    const labels = await client.labels();

    return { labels: labels.filter((label) => label.startsWith(input.prefix ?? '')) };
  },
});

const received = defineAppTrigger({
  slug: 'received',
  description: 'A message arrives.',
  type: 'app',
  event: 'message.received',
  input: z.object({}),
  output: z.object({ id: z.string() }),
  async run({ client, options }) {
    expectTypeOf(client).toEqualTypeOf<Mailer>();
    expectTypeOf(options).toEqualTypeOf<MailerOptions>();

    return [];
  },
});

const bounced = definePollingTrigger({
  slug: 'bounced',
  description: 'A message bounces.',
  type: 'polling',
  input: z.object({}),
  async run({ client, cursor }) {
    expectTypeOf(client).toEqualTypeOf<Mailer>();
    expectTypeOf(cursor).toEqualTypeOf<PieceJSON | undefined>();

    return { events: [] };
  },
});

const opened = defineWebhookTrigger({
  slug: 'opened',
  description: 'A message is opened.',
  type: 'webhook',
  input: z.object({}),
  async onEnable({ client, webhookUrl }) {
    const { hookId, secret } = await client.subscribe(webhookUrl);

    return { hookId, secret };
  },
  async onDisable({ state }) {
    expectTypeOf(state).toEqualTypeOf<HookState>();
  },
  renew: {
    schedule: '0 0 * * *',
    async run({ state }) {
      expectTypeOf(state).toEqualTypeOf<HookState>();

      return state;
    },
  },
  async run({ state }) {
    expectTypeOf(state).toEqualTypeOf<HookState>();

    return [];
  },
});

expectTypeOf(rootCreatePieceHelpers).toEqualTypeOf(createPieceHelpers);
expectTypeOf<PieceFrogBotRequest>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<PieceTriggerEvent<PieceJSON>>().toEqualTypeOf<TriggerEvent<PieceJSON>>();
expectTypeOf(send.slug).toEqualTypeOf<'send'>();
expectTypeOf(listLabels.slug).toEqualTypeOf<'listLabels'>();
expectTypeOf(received.slug).toEqualTypeOf<'received'>();
expectTypeOf(bounced.slug).toEqualTypeOf<'bounced'>();
expectTypeOf(opened.slug).toEqualTypeOf<'opened'>();

const createMailer = definePiece({
  slug: 'mailer',
  label: 'Mailer',
  options: z.object({ region: z.string() }),
  client: () => ({}) as Mailer,
  actions: [send, listLabels],
  triggers: [received, bounced, opened],
});

const mailer = createMailer({ region: 'eu' });

expectTypeOf<Parameters<typeof mailer.send>[0]['input']>().toEqualTypeOf<{
  to: string[];
  subject: string;
}>();
expectTypeOf<Parameters<typeof mailer.listLabels>[0]['input']>().toEqualTypeOf<{
  prefix?: string | undefined;
}>();
expectTypeOf(
  mailer.send({ input: { to: ['user@example.com'], subject: 'Hello' }, req }),
).toEqualTypeOf<Promise<{ id: string }>>();
expectTypeOf(mailer.listLabels({ input: {}, req })).toEqualTypeOf<Promise<{ labels: string[] }>>();

// @ts-expect-error send does not accept listLabels input
mailer.send({ input: { prefix: 'inbox' }, req });
// @ts-expect-error listLabels does not accept send input
mailer.listLabels({ input: { to: ['user@example.com'], subject: 'Hello' }, req });

expectTypeOf<keyof typeof mailer.triggers>().toEqualTypeOf<'received' | 'bounced' | 'opened'>();
expectTypeOf(mailer.triggers.received.type).toEqualTypeOf<'app'>();
expectTypeOf(mailer.triggers.bounced.type).toEqualTypeOf<'polling'>();
expectTypeOf(mailer.triggers.opened.type).toEqualTypeOf<'webhook'>();

const createTypedMailer = definePiece({
  slug: 'typed-mailer',
  label: 'Typed mailer',
  options: z.object({ region: z.string() }),
  client: () => ({}) as Mailer,
  actions: [send],
} satisfies PieceDefinition<MailerTypes, Mailer>);

const typedMailer = createTypedMailer({ region: 'eu' });

expectTypeOf(
  typedMailer.send({ input: { to: ['user@example.com'], subject: 'Hello' }, req }),
).toEqualTypeOf<Promise<{ id: string }>>();

const plain = createPieceHelpers();

expectTypeOf(plain).toEqualTypeOf<PieceHelpers<undefined, Record<string, never>>>();

const echo = plain.defineAction({
  slug: 'echo',
  description: 'Echo text.',
  input: z.object({ text: z.string() }),
  async run({ client, input, options }) {
    expectTypeOf(client).toEqualTypeOf<undefined>();
    expectTypeOf(options).toEqualTypeOf<Record<string, never>>();

    return input.text;
  },
});

const echoPiece = definePiece({ slug: 'echo', label: 'Echo', actions: [echo] })();

expectTypeOf(echoPiece.echo({ input: { text: 'hi' }, req })).toEqualTypeOf<Promise<string>>();

const archive = plain.defineAction({
  slug: 'archive',
  description: 'Archive a message.',
  input: z.object({ id: z.string() }),
  output: z.object({ archived: z.literal(true), state: z.enum(['archived', 'skipped']) }),
  async run({ input }) {
    const state = 'archived';

    return { archived: true, state, id: input.id };
  },
});

const expired = plain.definePollingTrigger({
  slug: 'expired',
  description: 'A message expires.',
  type: 'polling',
  input: z.object({}),
  output: z.object({ status: z.literal('expired') }),
  async run() {
    return { events: [{ status: 'expired' }] };
  },
});

const archivePiece = definePiece({
  slug: 'archive',
  label: 'Archive',
  actions: [archive],
  triggers: [expired],
})();

expectTypeOf(archivePiece.archive({ input: { id: '1' }, req })).toEqualTypeOf<
  Promise<{ archived: true; state: 'archived' | 'skipped' }>
>();

const lookupInput = z.object({ query: z.string() });

function widenedAction(slug: string) {
  return {
    slug,
    description: 'Look something up.',
    input: lookupInput,
    async run() {
      return null;
    },
  };
}

const satisfiedAction = {
  slug: 'satisfied',
  description: 'Look something up.',
  input: lookupInput,
  async run() {
    return null;
  },
} satisfies PieceActionDefinition<typeof lookupInput>;

const annotatedAction: PieceActionDefinition = {
  slug: 'annotated',
  description: 'Look something up.',
  input: lookupInput,
  async run() {
    return null;
  },
};

const annotatedTrigger: PieceAppTrigger<typeof lookupInput> = {
  slug: 'annotated',
  description: 'Something happens.',
  type: 'app',
  event: 'something.happened',
  input: lookupInput,
  async run() {
    return [];
  },
};

definePiece({
  slug: 'widened',
  label: 'Widened',
  actions: [
    // @ts-expect-error a slug: string factory is rejected
    widenedAction('lookup'),
  ],
});
definePiece({
  slug: 'satisfied',
  label: 'Satisfied',
  actions: [
    // @ts-expect-error satisfies PieceActionDefinition widens the slug
    satisfiedAction,
  ],
});
definePiece({
  slug: 'annotated',
  label: 'Annotated',
  actions: [
    // @ts-expect-error an annotated PieceActionDefinition widens the slug
    annotatedAction,
  ],
});
definePiece({
  slug: 'annotated-trigger',
  label: 'Annotated trigger',
  actions: [],
  triggers: [
    // @ts-expect-error an annotated PieceAppTrigger widens the slug
    annotatedTrigger,
  ],
});
definePiece({
  slug: 'mixed',
  label: 'Mixed',
  actions: [
    echo,
    // @ts-expect-error only the widened entry is reported
    widenedAction('lookup'),
    archive,
  ],
});

const asConst = definePiece({
  slug: 'as-const',
  label: 'As const',
  actions: [{ ...widenedAction('lookup'), slug: 'lookup' as const }],
})();

expectTypeOf(asConst.lookup({ input: { query: 'q' }, req })).toEqualTypeOf<Promise<null>>();

definePiece({ slug: 'empty', label: 'Empty', actions: [] });
definePiece({
  slug: 'inline',
  label: 'Inline',
  webhook: {
    async handshake({ req }) {
      expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

      return null;
    },
  },
  actions: [echo],
});

const tokenAuth = z.object({ token: z.string() });
const createEmptyOptions = definePiece({
  slug: 'empty-options',
  label: 'Empty options',
  auth: tokenAuth,
  options: z.object({}),
  client: ({ auth }: { auth: unknown }) => tokenAuth.parse(auth),
  actions: [echo],
});

expectTypeOf(
  createEmptyOptions({ auth: { token: 'token' } }).echo({ input: { text: 'hi' } }),
).toEqualTypeOf<Promise<string>>();
createEmptyOptions();
