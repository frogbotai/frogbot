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

Pass `req` to apply request-aware access, hooks, policy, and usage context. Programmatic operations override AI access by default; set `overrideAccess: false` to enforce configured AI access rules.

## Agents and AI

Agents use the configured AI gateway and resolve their optional `model` from the same provider configuration. An agent without a model uses `ai.defaultModel`. See the [agent documentation](https://docs.frogbot.ai/agents/overview) for agent configuration and execution.

## User model and budget policy

When AI is configured, FrogBot adds policy fields to the configured admin auth collection. `modelAccess: 'all'` permits every configured target, including targets added later. `selected` requires at least one exact model ID or router slug in `models`; granting a router does not grant direct access to its underlying model. Agent turns apply the same list: the manifest offers only allowed agent models, a request without a model uses the agent default if allowed or else the first allowed model, agents with none are hidden and return 403, and turns without a user have no per-user limit.

Register this collection in `collections` with the provider above. These defaults allow only `openai/gpt-5.4-mini` and set a USD 10 budget. Same-name fields override injected policy fields. The access callbacks prevent ordinary create/update requests from changing their own model grants, budget, or spend; trusted server operations can manage policy with explicit access override.

```ts
import type { CollectionConfig } from 'frogbot';

export const PolicyUsers: CollectionConfig = {
  slug: 'users',
  auth: true,
  fields: [
    {
      name: 'modelAccess',
      type: 'radio',
      options: ['all', 'selected'],
      defaultValue: 'selected',
      access: { create: () => false, update: () => false },
    },
    {
      name: 'models',
      type: 'select',
      hasMany: true,
      options: ['openai/gpt-5.4-mini'],
      defaultValue: ['openai/gpt-5.4-mini'],
      access: { create: () => false, update: () => false },
    },
    {
      name: 'monthlyBudget',
      type: 'number',
      defaultValue: 10,
      access: { create: () => false, update: () => false },
    },
    {
      name: 'spendThisPeriodUSD',
      type: 'number',
      access: { create: () => false, update: () => false },
    },
  ],
};
```

Policy fields other than the spend update lock have no default access restrictions; set their access explicitly when users must not edit policy. `monthlyBudget` is optional. Successful billable usage increments `spendThisPeriodUSD`, and a request is rejected when the user's spend has reached the budget. Settlement is serialized within one process, not reserved before execution across all workers; this is not a strict concurrent spending cap. Custom-provider accounting requires configured model prices.

FrogBot schedules monthly spend resets with `0 0 1 * *` on the `frogbot-reset-ai-budgets` queue. Keep a scheduler and worker covering that queue; the all-queues setup in [Jobs](https://raw.githubusercontent.com/frogbotai/frogbot/main/skills/frogbot/reference/JOBS.md#run-workers) covers it.

`resolvePolicy(user)` returns the normalized `AIUserPolicy`. AI operations enforce the user's exact target and budget when called with `req` and access enforcement enabled. `enforcePolicy({ req, target })` is also public, but does not replace operation-category access checks. Use the authenticated request from the application:

```ts
import type { FrogBotRequest } from 'frogbot';
import { resolvePolicy } from 'frogbot';

export async function generatePolicyUpdate(req: FrogBotRequest) {
  const policy = resolvePolicy(req.user);
  const result = await req.frogbot.generateText({
    model: 'openai/gpt-5.4-mini',
    prompt: 'Write a one-sentence project update.',
    req,
    overrideAccess: false,
  });

  return { policy, text: result.text };
}
```
