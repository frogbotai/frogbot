export type DojoEnv = {
  r2Endpoint: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  aiApiKey: string;
  aiBaseUrl: string;
  jobsSecret: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  url?: string;
};

/** Sign in with Dojo's variables. A missing one turns sign-in off instead of failing the start. */
export const SIGN_IN_VARIABLES = {
  oauthClientId: 'DOJO_OAUTH_CLIENT_ID',
  oauthClientSecret: 'DOJO_OAUTH_CLIENT_SECRET',
  url: 'DOJO_URL',
} as const;

const VARIABLES = {
  r2Endpoint: 'DOJO_R2_ENDPOINT',
  r2Bucket: 'DOJO_R2_BUCKET',
  r2AccessKeyId: 'DOJO_R2_ACCESS_KEY_ID',
  r2SecretAccessKey: 'DOJO_R2_SECRET_ACCESS_KEY',
  aiApiKey: 'DOJO_AI_API_KEY',
  aiBaseUrl: 'DOJO_AI_BASE_URL',
  jobsSecret: 'DOJO_JOBS_SECRET',
} as const satisfies Record<Exclude<keyof DojoEnv, keyof typeof SIGN_IN_VARIABLES>, string>;

/** Dojo's env when the app runs on Dojo (`DOJO=1`), otherwise `undefined`. */
export function readDojoEnv(): DojoEnv | undefined {
  if (process.env.DOJO !== '1') return undefined;

  const env = {} as DojoEnv;

  for (const [key, name] of Object.entries(VARIABLES) as [keyof DojoEnv, string][]) {
    const value = process.env[name];

    if (!value) throw new Error(`[plugin-dojo] DOJO=1 but ${name} is not set.`);

    env[key] = value;
  }

  for (const [key, name] of Object.entries(SIGN_IN_VARIABLES) as [keyof DojoEnv, string][]) {
    const value = process.env[name];

    if (value) env[key] = value;
  }

  return env;
}
