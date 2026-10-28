# AI

Docs: https://docs.frogbot.ai/ai/overview

FrogBot routes AI operations through providers configured in `frogbot.config.ts`. The initialized `FrogBot` instance exposes text, embedding, image, speech, transcription, video, and reranking operations.

## Configure a provider

The blank template configures a built-in provider and a default chat model. Built-in providers read their key from the environment (`OPENAI_API_KEY` here):

```ts
import type { FrogBotConfig } from 'frogbot';

const ai = {
  defaultModel: 'openai/gpt-5.4-mini',
  providers: { openai: true },
} satisfies FrogBotConfig['ai'];
```

Any OpenAI-compatible endpoint can be added as a custom provider:

```ts
const ai = {
  defaultModel: 'local/llama3',
  providers: {
    local: {
      type: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: process.env.LOCAL_API_KEY,
      models: [{ id: 'llama3', mode: 'chat' }],
    },
  },
} satisfies FrogBotConfig['ai'];
```

Custom model IDs use `<provider>/<model>`. Each custom model declares its mode, such as `chat`, `embedding`, `image_generation`, `audio_speech`, `audio_transcription`, `rerank`, or `video_generation`.

## Generate text

```ts
import { getFrogBot } from 'frogbot';

import config from './frogbot.config';

const frogbot = await getFrogBot({ config });
const result = await frogbot.generateText({
  model: 'openai/gpt-5.4-mini',
  prompt: 'Write a one-sentence project update.',
});

console.log(result.text);
```

Direct AI operations require `model`, even when `ai.defaultModel` is configured. Use either `prompt` or `messages`, not both.

## Stream text

```ts
const result = await frogbot.streamText({
  model: 'openai/gpt-5.4-mini',
  prompt: 'Explain the release plan.',
});

for await (const text of result.textStream) {
  process.stdout.write(text);
}
```

## Other operations

All operation methods are public on the initialized instance. This embedding example uses the OpenAI provider shown above:

```ts
const embedding = await frogbot.embed({
  model: 'openai/text-embedding-3-small',
  value: 'FrogBot project notes',
});
```

Available methods are `generateText`, `streamText`, `embed`, `embedMany`, `generateImage`, `generateSpeech`, `transcribe`, `generateVideo`, and `rerank`. Configure a provider and model with the matching mode before using an operation.

Pass `req` to apply request-aware access, hooks, and usage context. A call with `req` runs the matching `ai.access` rule unless `overrideAccess: true` is set; a call without `req` skips access.

## Agents and AI

Agents use the configured AI gateway and resolve their optional `model` from the same provider configuration. An agent without a model uses `ai.defaultModel`. See the [agent documentation](https://docs.frogbot.ai/agents/overview) for agent configuration and execution.

## Control access

`ai.access` has one rule per operation category: `generate`, `embed`, `transcribe`, `rerank`, and `evaluate`. Each receives `{ req, model }`, where `model` is the model ID or router slug the caller passed, and defaults to `Boolean(req.user)`. FrogBot runs the rule before every AI operation and `/api/v1/*` request, and runs `generate` for each agent model to decide what a signed-in user sees and may select in chat. Return `false` for a generic 403, or throw an error with a numeric `status` and a `code`; HTTP routes return it as `{ error: { message, type: code } }`.

```ts
class OutOfCreditsError extends Error {
  status = 402;
  code = 'insufficient_credits';
}

const ai = {
  defaultModel: 'openai/gpt-5.4-mini',
  providers: { openai: true },
  access: {
    generate: ({ req, model }) => {
      if (!req.user) return false;
      if (typeof req.user.credits !== 'number' || req.user.credits <= 0)
        throw new OutOfCreditsError('You have no credits left.');

      return model !== 'openai/gpt-5.4';
    },
  },
} satisfies FrogBotConfig['ai'];
```

To charge for calls, add an `ai.hooks.afterOperation` hook that prices `usage` with `calculateUsageCostUSD({ model, providers, usage })` from `frogbot`.

## User model and budget policy

`@frogbotai/plugin-ai-policy` (in the blank template) adds per-user model lists and monthly budgets on top of `ai.access`. It needs `ai` config and adds three fields to the auth collection (`authCollection` option; default: the only auth collection, or `admin.user` when there are several; users of other auth collections have no policy):

- `models`: model IDs and router slugs the user may call. Empty allows every configured model. Entries are exact: a router slug does not allow direct calls to its model.
- `monthlyBudget`: optional USD limit; empty means no limit.
- `spendThisPeriodUSD`: read-only spend the plugin maintains.

```ts
import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import type { CollectionConfig } from 'frogbot';

export const PolicyUsers: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'monthlyBudget',
      type: 'number',
      defaultValue: 10,
      access: { update: ({ req }) => req.user?.role === 'admin' },
    },
  ],
};

export const plugins = [aiPolicyPlugin()];
```

A same-name field replaces the settings it sets, and its `admin` and `access` merge over the plugin's. The fields have no access rules other than the spend lock, so set `access` when users must not edit their own policy.

After the app's own `ai.access` rule allows a signed-in user, the plugin rejects a model outside a non-empty `models` list (403 `model_not_allowed`); chat and agent model lists use the same check. The budget is checked in `beforeOperation`, before every AI call including agent turns, and rejects a user whose spend has reached it (403 `budget_exceeded`); it never hides agents or models from lists. Calls without a user have no per-user limit. After each successful billable call, the plugin adds its cost to `spendThisPeriodUSD`; updates are serialized per user within one process only, so the budget is not a strict concurrent cap. Custom-provider accounting requires configured model prices.

The `plugin-ai-policy-reset-spend` task zeros spend with `0 0 1 * *` on its own `plugin-ai-policy-reset-spend` queue. Keep a scheduler and worker covering that queue; the all-queues setup in [Jobs](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md#run-workers) covers it.

Docs: https://docs.frogbot.ai/plugins/ai-policy
