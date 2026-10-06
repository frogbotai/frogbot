# @frogbotai/plugin-sentry

Capture FrogBot server and admin errors with Sentry.

```ts
import * as Sentry from '@sentry/nextjs';
import { sentryPlugin } from '@frogbotai/plugin-sentry';
import { buildConfig } from 'frogbot';

export default buildConfig({
  collections: [],
  plugins: [sentryPlugin({ Sentry })],
});
```

It supports the enablement, status capture, context, debug, and Sentry instance options, and uses FrogBot's supported `afterError` hook and admin provider surfaces.
