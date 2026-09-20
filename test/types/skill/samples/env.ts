import { defineEnv, env, frogbotEnv } from 'frogbot/env';

export const appEnv = defineEnv({
  ...frogbotEnv,
  emailEnabled: env.boolean().default(false),
  smtpUrl: env.string().requiredWhen((values) => values.emailEnabled === true),
  region: env.enum(['us-east-1', 'eu-west-1']).required(),
});
