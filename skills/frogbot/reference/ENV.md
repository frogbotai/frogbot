# Environment Variables

Docs: https://docs.frogbot.ai/configuration/environment-vars

Use `frogbot/env` to parse server-side environment variables once and expose typed, frozen values.

```ts
import { defineEnv, env, frogbotEnv } from 'frogbot/env';

export const appEnv = defineEnv({
  ...frogbotEnv,
  emailEnabled: env.boolean().default(false),
  smtpUrl: env.string().requiredWhen((values) => values.emailEnabled === true),
  region: env.enum(['us-east-1', 'eu-west-1']).required(),
});
```

| Builder             | Parsed value                   |
| ------------------- | ------------------------------ |
| `env.string()`      | String                         |
| `env.number()`      | Number                         |
| `env.boolean()`     | Case-insensitive boolean forms |
| `env.enum([...])`   | One listed string              |
| `env.custom(parse)` | Parser result                  |

Modifiers are `.default(value)`, `.required()`, `.requiredWhen(predicate)`, and `.name('CUSTOM_NAME')`. Defaults and required modifiers are mutually exclusive. A builder can have only one required modifier.

Property names derive environment names: `apiUrl` becomes `API_URL`, `gitSha1` becomes `GIT_SHA1`, and `s3Bucket` becomes `S3_BUCKET`. `.name()` accepts uppercase names matching `[A-Z_][A-Z0-9_]*`. Duplicate resolved names are rejected.

Empty strings count as unset. All present values are parsed and all parse or missing-value issues are reported together through `FrogBotEnvError`. Required checks are skipped when `NODE_ENV=test`, but present invalid values still fail.

`frogbotEnv` provides:

| Property        | Name             | Behavior                 |
| --------------- | ---------------- | ------------------------ |
| `databaseUrl`   | `DATABASE_URL`   | Required string          |
| `frogbotSecret` | `FROGBOT_SECRET` | Required string          |
| `logLevel`      | `LOG_LEVEL`      | Defaults to `info`       |
| `nodeEnv`       | `NODE_ENV`       | Defaults to `production` |
| `port`          | `PORT`           | Defaults to `3000`       |

Do not expose server secrets to client components. In Next.js, only variables intentionally prefixed with `NEXT_PUBLIC_` are available to client code.
