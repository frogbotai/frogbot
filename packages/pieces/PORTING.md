# Porting a Piece

Port from the Activepieces 0.32.0 source into a native `definePiece` package. Use the upstream source as a behavior reference, not a runtime dependency: the finished package must not depend on `@activepieces/*` or recreate its engine context.

## Package shape

- Put implementation in `packages/pieces/piece-<slug>/` and tests in `test/unit/piece-<slug>/`.
- Follow an existing built package's `package.json`, `tsconfig.json`, exports, and scripts.
- Add every imported runtime library, including the vendor SDK and `zod`, to `dependencies`.
- Add declaration packages needed to type-check the package to `devDependencies`; do not rely on another workspace package installing them.
- Export a `create<Service>` factory created by `definePiece`.
- Keep definitions declarative: object schemas and inline arrays of actions and triggers.
- A package may run `frogbot generate:piece-types` and ship its generated types. Pass them as `PieceDefinition<GeneratedTypes, Client>`; applications do not generate types for installed pieces.
- Prefer a maintained, ESM-compatible official vendor SDK. Use `fetch` when no suitable SDK exists.

## Module layout

Each piece exposes its public definition from `src/index.ts`. Keep that definition declarative and assemble it from focused internal modules.

```text
src/
  index.ts
  config.ts
  client.ts
  piece-types.ts
  actions/
    send.ts
    listMessages.ts
  triggers/
    messageCreated.ts
  email.ts
  channel.ts
```

| Module                  | Owns                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `index.ts`              | The `definePiece` call, action/trigger assembly, and public exports.   |
| `config.ts`             | Authentication and factory-option schemas.                             |
| `client.ts`             | The vendor client, request transport, and client type.                 |
| `actions/<action>.ts`   | One action's schema, metadata, and `run` implementation.               |
| `triggers/<trigger>.ts` | One trigger's schema, metadata, and lifecycle implementation.          |
| Capability modules      | A single capability implementation such as `email.ts` or `channel.ts`. |
| `piece-types.ts`        | Generated schema-derived types. Never edit this file.                  |

Create an action or trigger directory when the piece has more than one of that kind. Small pieces may keep their sole action or trigger in `index.ts`.

- Define an action's input and output schemas beside that action. A reader should understand its entire vendor operation from one file.
- Use `satisfies` with generated types. Keep authoring declarative; do not add builder callbacks.
- Extract only genuinely shared, specifically named concerns such as `format.ts` or `pagination.ts`. Do not create catch-all `shared.ts`, `utils.ts`, or `schemas.ts` modules.
- Keep vendor transport in `client.ts`; actions call the client rather than `fetch` directly.
- Internal modules import each other directly. Do not import internal code through `index.ts`.
- Add a capability module only when the piece implements that capability. Do not create empty placeholders.
- Run `frogbot generate:piece-types` after schema changes and ship the resulting `piece-types.ts` file.
- Do not register placeholder actions. If an action cannot be implemented without a new product or dependency decision, stop and report the blocker rather than shipping an action that always fails.

## Callback arguments

Every callback takes one arguments object. Do not add arguments copied from the upstream engine.

### `client`

| Argument  | Type             | Why it earns its keep                               |
| --------- | ---------------- | --------------------------------------------------- |
| `auth`    | inferred auth    | Credential wrapped by the client.                   |
| `options` | inferred options | Non-credential settings such as base URL or region. |

There is no `req`; clients are memoized per credential.

### `action.run`

| Argument  | Type             | Why it earns its keep                                        |
| --------- | ---------------- | ------------------------------------------------------------ |
| `input`   | inferred input   | Validated action input.                                      |
| `client`  | client           | Calls the vendor without exposing auth.                      |
| `options` | inferred options | Factory defaults needed by the action.                       |
| `req`     | `FrogBotRequest` | Acting user, local API, files, KV, context, and transaction. |

### `action.options[key]`

| Argument  | Type                   | Why it earns its keep                |
| --------- | ---------------------- | ------------------------------------ |
| `input`   | partial inferred input | Supports dependent fields.           |
| `client`  | client                 | Lists vendor choices.                |
| `options` | inferred options       | Supplies factory defaults.           |
| `req`     | `FrogBotRequest`       | Supplies user and local API context. |

### `trigger.run` for `webhook` and `app`

| Argument  | Type             | Why it earns its keep                       |
| --------- | ---------------- | ------------------------------------------- |
| `input`   | inferred input   | Filters the delivery for this subscription. |
| `client`  | client           | Fetches missing event details.              |
| `options` | inferred options | Supplies factory defaults.                  |
| `req`     | `FrogBotRequest` | Carries the parsed delivery in `req.data`.  |

Return an array of emitted events.

Webhook trigger runs also receive the state returned by `trigger.onEnable`:

| Argument | Type         | Why it earns its keep                               |
| -------- | ------------ | --------------------------------------------------- |
| `state`  | enable state | Identifies the persisted subscription registration. |

### `trigger.run` for `polling`

| Argument  | Type             | Why it earns its keep                    |
| --------- | ---------------- | ---------------------------------------- |
| `input`   | inferred input   | Identifies what to poll.                 |
| `cursor`  | optional cursor  | Continues from the previous poll.        |
| `client`  | client           | Performs the poll.                       |
| `options` | inferred options | Supplies factory defaults.               |
| `req`     | `FrogBotRequest` | Synthetic request with local API access. |

Return `{ events, cursor }`.

### `trigger.onEnable`

| Argument     | Type             | Why it earns its keep                            |
| ------------ | ---------------- | ------------------------------------------------ |
| `input`      | inferred input   | Identifies what to subscribe to.                 |
| `webhookUrl` | `string`         | Per-subscription URL registered with the vendor. |
| `client`     | client           | Registers the webhook.                           |
| `options`    | inferred options | Supplies factory defaults.                       |
| `req`        | `FrogBotRequest` | Synthetic request with local API access.         |

Return all state needed by `onDisable`.

### `trigger.onDisable`

| Argument  | Type             | Why it earns its keep                    |
| --------- | ---------------- | ---------------------------------------- |
| `input`   | inferred input   | Matches the enabled subscription.        |
| `state`   | enable state     | Identifies the registered webhook.       |
| `client`  | client           | Removes the webhook.                     |
| `options` | inferred options | Supplies factory defaults.               |
| `req`     | `FrogBotRequest` | Synthetic request with local API access. |

### `trigger.renew.run`

Uses the `trigger.onEnable` arguments plus the previous `state`, and returns replacement state.

### `webhook.verify`

| Argument  | Type             | Why it earns its keep                                     |
| --------- | ---------------- | --------------------------------------------------------- |
| `req`     | `FrogBotRequest` | Provides raw body and headers for signature verification. |
| `options` | inferred options | Holds signing configuration outside user auth.            |

### `webhook.handshake`

| Argument  | Type             | Why it earns its keep                |
| --------- | ---------------- | ------------------------------------ |
| `req`     | `FrogBotRequest` | Carries the challenge in `req.data`. |
| `options` | inferred options | Supports signed challenges.          |

Return a response for a handled challenge or `null`.

### `webhook.parse`

| Argument | Type             | Why it earns its keep                   |
| -------- | ---------------- | --------------------------------------- |
| `req`    | `FrogBotRequest` | Carries the vendor event in `req.data`. |

Return `{ event }` for app-trigger routing.

### `email.send`

| Argument  | Type               | Why it earns its keep                           |
| --------- | ------------------ | ----------------------------------------------- |
| `message` | `SendEmailOptions` | Outgoing message.                               |
| `client`  | client             | Sends the message.                              |
| `options` | inferred options   | Supplies sender and reply defaults.             |
| `req`     | `FrogBotRequest`   | Carries the caller or a synthetic core request. |

### `channel.adapter`

| Argument  | Type             | Why it earns its keep              |
| --------- | ---------------- | ---------------------------------- |
| `auth`    | inferred auth    | Credential owned by the adapter.   |
| `options` | inferred options | Supplies signing secret or app id. |

There is no `req`; the adapter is built once at boot.

### `channel.identity`

| Argument | Type             | Why it earns its keep                             |
| -------- | ---------------- | ------------------------------------------------- |
| `author` | `ChatSdkAuthor`  | Identifies the inbound platform author.           |
| `client` | client           | Looks up the author's account details.            |
| `req`    | `FrogBotRequest` | Finds the local user and carries channel context. |

Return the matched user with its `collection`, or `null` when the platform identity has no local match. Propagate vendor lookup failures rather than treating them as anonymous access.

### `oauth.toAuth`

| Argument | Type          | Why it earns its keep                              |
| -------- | ------------- | -------------------------------------------------- |
| `tokens` | `OAuthTokens` | Maps the stored token response to the auth schema. |

### `oauth.account`

| Argument | Type             | Why it earns its keep                           |
| -------- | ---------------- | ----------------------------------------------- |
| `tokens` | `OAuthTokens`    | May contain account identity.                   |
| `client` | client           | Fetches identity when tokens do not contain it. |
| `req`    | `FrogBotRequest` | Identifies the linking user.                    |

### `oauth.refresh`

| Argument | Type             | Why it earns its keep                              |
| -------- | ---------------- | -------------------------------------------------- |
| `tokens` | `OAuthTokens`    | Supplies the current refresh token and token set.  |
| `req`    | `FrogBotRequest` | Synthetic request with local configuration access. |

## Contract mapping

Build the inventory from the upstream piece's registered `actions` and `triggers`, not FrogBot's previous default-action list or wrapper exports. Those narrower surfaces may omit supported actions, custom API calls, or every trigger.

| Activepieces                                                                         | Native FrogBot contract                                                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `displayName`, `logoUrl`, `description`, `categories`, `authors`                     | `label` and `admin.{description,icon,group}`; drop authors.                                               |
| Auth variants and `validate`                                                         | `auth` zod schema and, for OAuth2/OIDC, an `oauth` recipe. Validation belongs in schemas or client calls. |
| `action.props`                                                                       | `input` zod schema with `.meta({ label, description })`.                                                  |
| `Dropdown.options`, `DynamicProperties`                                              | `action.options`.                                                                                         |
| `action.test`, `requireAuth`, `audience`                                             | Drop.                                                                                                     |
| `errorHandlingOptions`                                                               | Drop; retries and continuation are workflow settings.                                                     |
| `outputSchema`, `aiMetadata.idempotent`                                              | Re-author a real `output` schema when useful; map idempotence to `idempotent`.                            |
| `ctx.auth`, `ctx.propsValue`                                                         | `client`, `input`; auth is passed only to `client`.                                                       |
| `ctx.store`                                                                          | Trigger `state` or polling `cursor`; actions may use `req.frogbot.kv`.                                    |
| `ctx.files.write`                                                                    | `req.frogbot` and the configured files collection.                                                        |
| `ctx.connections.get`                                                                | Drop; credential resolution produces `client`.                                                            |
| `ctx.server`                                                                         | Drop; use the in-process local API. `webhookUrl` is explicit where needed.                                |
| `ctx.run.id`, `stop`, `respond`                                                      | Drop; these belong to the workflow host.                                                                  |
| Waitpoints, `executionType`, `resumePayload`, `run.pause`, `generateResumeUrl`       | Drop; durable waits belong to workflows. Accept resume URLs as action input when needed.                  |
| `ctx.output.update`, `ctx.flows`, `ctx.step`, `ctx.project`, `ctx.tags`, `ctx.agent` | Drop.                                                                                                     |
| `TriggerStrategy.WEBHOOK`, `webhookUrl`                                              | `type: 'webhook'` with `onEnable` and `onDisable`.                                                        |
| `APP_WEBHOOK`, listeners, event parse/verify                                         | `type: 'app'` plus `piece.webhook`; do not port account identifiers.                                      |
| `POLLING`, `setSchedule`                                                             | `type: 'polling'`, optional `schedule`, and returned cursor.                                              |
| `MANUAL`                                                                             | Drop.                                                                                                     |
| Handshake configuration                                                              | `piece.webhook.handshake`.                                                                                |
| Renewal configuration                                                                | `trigger.renew`.                                                                                          |
| `_dedupe_key`                                                                        | `event.dedupeKey`.                                                                                        |
| `sampleData`, `testStrategy`                                                         | `sample`; native tests call `run`.                                                                        |
| Context versions, compatibility shims, i18n                                          | Drop.                                                                                                     |

## Property mapping

Apply `required`, defaults, bounds, and labels from the source. Optional properties use `.optional()`.

| Property type                  | Zod/native mapping                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `SHORT_TEXT`                   | `z.string()`                                                                                                            |
| `LONG_TEXT`                    | `z.string()`                                                                                                            |
| `MARKDOWN`                     | `z.string()`; markdown is presentation metadata, not a distinct value type.                                             |
| `DROPDOWN`                     | Schema for the option value plus `action.options[key]`.                                                                 |
| `STATIC_DROPDOWN`              | `z.enum`, `z.literal` union, or the exact option-value schema.                                                          |
| `NUMBER`                       | `z.number()` with applicable bounds.                                                                                    |
| `CHECKBOX`                     | `z.boolean()`                                                                                                           |
| `ARRAY`                        | `z.array(itemSchema)`                                                                                                   |
| `OBJECT`                       | `z.object(...)` when fields are known; otherwise `z.record(z.string(), z.unknown())`.                                   |
| `JSON`                         | A recursive JSON schema or the narrow known shape.                                                                      |
| `MULTI_SELECT_DROPDOWN`        | `z.array(optionValueSchema)` plus `action.options[key]`.                                                                |
| `STATIC_MULTI_SELECT_DROPDOWN` | `z.array()` of the exact static option-value schema.                                                                    |
| `DYNAMIC`                      | Re-author stable fields in `input`; supply choices through `action.options`.                                            |
| `DATE_TIME`                    | `z.string()` with datetime validation when the vendor requires ISO 8601.                                                |
| `FILE`                         | The configured files collection's id type, commonly `z.union([z.string(), z.number()])`; load it through `req.frogbot`. |
| `COLOR`                        | `z.string()` with the vendor's color format validation when defined.                                                    |
| `CUSTOM`                       | Re-author its value schema and dynamic choices through `action.options`; do not port UI components.                     |

## Auth mapping

| Upstream auth      | Native mapping                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| None               | Omit `auth` and usually `client`.                                                                                           |
| `SecretText`       | `auth: z.object({ ... })`; mark secrets in schema metadata where supported.                                                 |
| `BasicAuth`        | One auth object containing username and password.                                                                           |
| `CustomAuth`       | One auth object preserving only fields the client needs.                                                                    |
| `OAuth2` or `OIDC` | Auth schema for the client plus `oauth` URLs, scopes, params, token mapping, account lookup, and optional refresh override. |
| Auth array         | One auth object with optional variant fields; the OAuth recipe fills its variant. Do not expose a union selector.           |

Credential methods are capabilities declared by `auth`, `oauth`, and factory configuration. Never infer them from field names or token-shaped values.

For file-backed actions, preserve the caller's request and access context on local API reads and writes. Forward cookies or authorization only to same-origin FrogBot file URLs, reject unsafe URL schemes and embedded credentials, reject redirects, and propagate cancellation.

## Trigger mapping

| Upstream strategy | Native trigger                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOK`         | `type: 'webhook'`; register the supplied URL in `onEnable`, return registration state, remove it in `onDisable`, and map renewal when present. |
| `APP_WEBHOOK`     | `type: 'app'`; set `event`, verify/parse through `piece.webhook`, and filter the delivery in `run`.                                            |
| `POLLING`         | `type: 'polling'`; map schedule, return `{ events, cursor }`, and do not create a side store.                                                  |
| `MANUAL`          | Drop.                                                                                                                                          |

Keep handshake logic in `piece.webhook.handshake`, samples in `sample`, and deduplication values in `event.dedupeKey`.

## Semantic names

- Use camelCase `verbResource`; remove vendor prefixes, redundant `action`, and version suffixes.
- Prefer `create`, `get`, `list`, `search`, `update`, and `delete` when those meanings fit.
- Use `getIssue` for one item by id and `getUserByEmail` for an alternate-key lookup.
- Use plural resources for collections and batches: `listIssues`, `searchEmails`.
- Use the same noun for the same concept across pieces. Preserve genuinely distinct vendor concepts.
- Keep meaningful domain verbs such as `send`, `reply`, `archive`, `upload`, and `invite`.
- Preserve the reviewed shorthand `gmail.send` and `resend.send`. New exceptions require a shared convention decision.

Examples: `linear_linear_create_issue` becomes `createIssue`; `gmail_get_mail` becomes `getEmail`; `gmail_search_mail` becomes `searchEmails`; `sendRequest` remains `sendRequest`.

## Testing

- Exercise native action methods against a controlled transport or fixture. Do not mock `run`.
- Use FrogBot's real `definePiece` implementation in tests. Do not replace it with a per-piece harness that skips input parsing, output parsing, or instance wiring.
- Give every action a meaningful output schema and assert the parsed result through the native action method.
- Verify auth and options reach the client correctly, request mapping is exact, responses satisfy `output`, and vendor failures remain useful failures.
- Test every dynamic options callback and each trigger callback directly. OAuth and unhosted trigger behavior may be declaration/type tests until their hosts exist.
- Adapt useful upstream behavior tests from the selected source revision when available. Missing published tests are not a blocker, and wholesale migration is unnecessary.
- Never recreate discarded engine APIs to reuse an upstream test.
- Before removing `.legacy`, confirm every registered upstream action and trigger is covered by the README mapping, deliberate drops name the owning native primitive, and the native package tree has no `@activepieces` reference or dependency.

### Channel conformance fixtures

Pass `channel` to `pieceConformance` for every channel piece; it remains optional for pieces without channels. Supply a fresh Chat `StateAdapter` and controlled vendor transport before calling the helper. The helper initializes the real adapter through `ChannelChat`, delivers each request, waits for background delivery tasks, and shuts down afterward.

Assert the adapter name, one representative identity result, and valid and invalid deliveries for every HTTP transport the piece accepts. Every delivery requires an exact response status and `messages` array containing the dispatched message IDs, thread IDs, text, and author IDs. Use `messages: []` for rejected requests, handshakes, and events that should not dispatch a message. Include piece handshake and parsed event expectations only when that transport defines them; use `delivery.body` for adapter-owned handshake responses.

```ts
await pieceConformance(createExample, {
  factoryOptions: { auth: { token: 'token' }, signingSecret: 'secret' },
  actions: [],
  channel: {
    adapter: { name: 'example' },
    identity: {
      author: { userId: 'platform-user' },
      req,
      expect: { id: 'user', collection: 'users' },
    },
    webhook: {
      state,
      requests: [
        {
          request: { headers, body: rawBody, data: delivery },
          verified: true,
          event: 'message.created',
          delivery: {
            status: 200,
            messages: [
              {
                id: 'message-1',
                threadId: 'example:channel-1:thread-1',
                text: 'Hello FrogBot',
                authorId: 'platform-user',
              },
            ],
          },
        },
        {
          request: { headers: invalidHeaders, body: rawBody, data: delivery },
          verified: false,
          delivery: { status: 401, messages: [] },
        },
      ],
    },
  },
});
```

Keep fixtures and transport/state helpers under root `test/`. Use the exact recorded raw body for signature checks and set the separately parsed value in `request.data`. Supply realistic adapter fields, including GitHub's `comment.user` and Linear's `agentSession.creator.url`; event-name parsing alone does not prove delivery. Control initialization lookups such as Telegram bot identity and Linear viewer identity without replacing adapter initialization, verification, or message handling.

When `piece.webhook.verify` exists, `verified` checks its result as well as the adapter response. Teams and Discord can omit that callback: their official adapters own authentication, and denial fixtures must assert the adapter's 401/403 response and zero messages. Include signed Discord interactions and authenticated forwarded Gateway messages. Gateway listener lifecycle, full identity/access enforcement, and conversation persistence belong in host integration tests. Record any missing valid-JWT or live-service coverage explicitly.

Each channel piece README must add a setup section containing the required app or bot registration, credentials and scopes, subscribed events, and its instance webhook URL: `/api/webhooks/<piece-instance-slug>`. Add `/<subscription-id>` only for vendor webhooks registered by a `webhook` trigger.

## README template

````md
# `<package-name>`

<One sentence describing the vendor capabilities exposed by this piece.>

## Usage

```ts
import { createExample } from '<package-name>';

export const example = createExample({ auth: { apiKey: process.env.EXAMPLE_API_KEY! } });
```

## Actions

| Upstream action slug | Previous wrapper export | Native action | Notes |
| -------------------- | ----------------------- | ------------- | ----- |
| `create_item`        | `exampleCreateItem`     | `createItem`  |       |

List every registered upstream action, including actions omitted from the previous wrapper's defaults. Mark intentionally dropped actions and explain the native alternative.

## Triggers

| Upstream trigger slug | Native trigger | Type      | Notes |
| --------------------- | -------------- | --------- | ----- |
| `item_created`        | `itemCreated`  | `webhook` |       |

List every registered upstream trigger. Omit this section only when the upstream piece has no triggers.
````
