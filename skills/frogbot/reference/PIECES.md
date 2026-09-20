# Pieces

Docs: https://docs.frogbot.ai/pieces/overview, https://docs.frogbot.ai/pieces/index, and https://docs.frogbot.ai/pieces/triggers

Pieces package reusable actions, triggers, authentication, and service clients. Import authoring APIs from `frogbot/pieces` and installed factories from their piece package.

## Use a piece

```ts
import { createGoogle } from '@frogbotai/piece-google';

export const google = createGoogle({
  oauth: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
});
```

A factory accepts an optional instance `slug`, static `auth`, OAuth app credentials when the definition has an OAuth recipe, and fields declared by its `options` schema. Actions become methods on the instance. They parse input, resolve the request-scoped client, run the action, and parse a declared output. The following uses `const piece = createExample({})` from the authoring example below and an authenticated `req` with an active connection for that instance.

```ts
const result = await piece.lookup({
  input: { id: '123' },
  req,
});
```

Pass a request when credentials may come from the signed-in user's connection. Static-auth pieces can use their configured credential when no user connection exists.

## Author a piece

```ts
import { definePiece } from 'frogbot/pieces';
import { z } from 'zod';

const auth = z.object({ token: z.string().min(1) });
const lookupInput = z.object({ id: z.string() });

export const createExample = definePiece({
  slug: 'example',
  label: 'Example',
  auth,
  client: ({ auth: credential }) => ({ token: auth.parse(credential).token }),
  actions: [
    {
      slug: 'lookup',
      description: 'Look up an item',
      input: lookupInput,
      output: z.object({ id: z.string() }),
      async run({ input }) {
        const data = lookupInput.parse(input);

        return { id: data.id };
      },
    },
  ],
});
```

Inline definition callbacks receive `unknown` values in the current authoring types. Parse them with the declared schemas before reading properties.

| Capability         | Definition field                                       |
| ------------------ | ------------------------------------------------------ |
| Static credentials | `auth` schema and `client`                             |
| OAuth              | `oauth` recipe plus `auth` and `client`                |
| Actions            | `actions`                                              |
| Triggers           | `triggers` with `app`, `polling`, or `webhook` type    |
| Email              | `email.send`                                           |
| Webhook handling   | `webhook.verify`, `webhook.handshake`, `webhook.parse` |
| Chat identity      | `channel.adapter` and `channel.identity`               |

Piece and instance slugs must be URL-safe. Action and trigger slugs must be valid JavaScript method names, unique, and not reserved. OAuth recipes require HTTP authorization and token URLs, an auth schema, and non-empty scope strings.

An OAuth instance is eligible for interactive sign-in only when its recipe defines `account` and the factory receives OAuth app credentials. `account` may return an email only after the provider has verified it.

## Trigger lifecycle

Mount an instance's trigger reference in an agent's `triggers` array, then register the agent. Use `AgentConfig<typeof instance.triggers.triggerName>` to infer handler events from the trigger schema. FrogBot discovers the instance through the mount; separate root `pieces` registration is not required. Distinct instances need unique slugs.

| Type      | Default callback route                            | Lifecycle                                                                                                                                                             |
| --------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhook` | `/api/webhooks/<instance-slug>/<subscription-id>` | Set `serverURL`. Boot reconciliation calls `onEnable` with the generated `webhookUrl`, persists its returned state, and supplies that state to `run` and `onDisable`. |
| `app`     | `/api/webhooks/<instance-slug>`                   | Register the URL with the provider. `webhook.parse` selects the declared event; no provider-subscription lifecycle runs.                                              |
| `polling` | None                                              | The definition type exists, but mounting a polling trigger is currently rejected. Automatic subscription renewal is not implemented.                                  |

The configured `routes.api` replaces `/api`. Webhook definitions require `onEnable` and `onDisable`; configure credentials that boot-time server requests can resolve. Reconciliation reuses unchanged subscriptions, replaces changed input, and cleans up removed mounts. Keep an instance and its credentials available while removing its subscriptions: missing cleanup credentials leave a retained ledger entry and warning.

If provider registration succeeds but saving state fails, FrogBot attempts cleanup. Pending cleanup or unresolved registration is retained for recovery rather than blindly registering a duplicate. A process crash before state is persisted can still require manual provider cleanup.

### Manage mounted subscriptions

Use these helpers only in trusted server code with an initialized instance. `mount` contains the existing agent slug, instance slug, and webhook trigger slug; optional `input` replaces the mount's input after schema validation. `enable` cannot create an undeclared trigger mount. `list` includes pending/error entries. Disable a returned subscription when provider cleanup is intended:

```ts
import type { FrogbotInstance, Subscription, SubscriptionEnableProps } from 'frogbot';

export async function enableMountedTrigger({
  frogbot,
  mount,
}: {
  frogbot: FrogbotInstance;
  mount: SubscriptionEnableProps;
}) {
  const subscription = await frogbot.triggers.enable(mount);
  const subscriptions = await frogbot.triggers.list();

  return { subscription, subscriptions };
}

export async function disableMountedTrigger({
  frogbot,
  subscription,
}: {
  frogbot: FrogbotInstance;
  subscription: Subscription;
}) {
  await frogbot.triggers.disable(subscription.id);
}
```

Disabling a missing ID is a no-op. Cleanup failures reject and retain the ledger entry. Runtime changes do not edit the application config: the next boot restores declarative input and re-enables mounts that remain configured.

### Delivery and workers

Configure `webhook.verify` for provider authentication; a failed check returns `401` before events are queued. Each emitted event requires `{ dedupeKey, data }`; agent handlers receive `data` and `req.context.trigger` with the agent, instance, and trigger slugs. Dedupe lasts 24 hours per recipient. Enqueue and dedupe persistence are separate, so handler side effects must tolerate duplicate delivery. The generated trigger task does not configure automatic handler retries.

Mounted triggers add an all-queues autorun entry every minute. For dedicated workers, use the execution guard and queue coverage described in [Jobs](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md#run-workers).
