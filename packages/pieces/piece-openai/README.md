# `@frogbotai/piece-openai`

OpenAI as a linked account: each user runs FrogBot's AI on their own OpenAI API key or ChatGPT plan.

## Usage

```ts
import { createOpenAI } from '@frogbotai/piece-openai';
import { buildConfig } from 'frogbot';

export default buildConfig({
  // secret, db, and collections omitted
  connections: [{ piece: createOpenAI(), oauth: true, secret: true }],
});
```

Users paste a key in **Settings → Linked accounts**, or choose **Continue with ChatGPT** to run on their ChatGPT plan when the app runs on their own computer. FrogBot checks a pasted key with one `GET /v1/models` call before saving it. See [OpenAI](https://docs.frogbot.ai/pieces/openai) for the credential order, the ChatGPT sign-in and the app key.
