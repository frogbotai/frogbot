# `@frogbotai/piece-openai`

OpenAI as a linked account: each user runs FrogBot's AI on their own OpenAI API key.

## Usage

```ts
import { createOpenAI } from '@frogbotai/piece-openai';
import { buildConfig } from 'frogbot';

export default buildConfig({
  // secret, db, and collections omitted
  connections: [{ piece: createOpenAI(), secret: true }],
});
```

Users paste a key in **Settings → Linked accounts**. FrogBot checks it with one `GET /v1/models` call before saving it. See [OpenAI](https://docs.frogbot.ai/pieces/openai) for the credential order and the app key.
