export type DojoEnv = {
  r2Endpoint: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  aiApiKey: string;
  aiBaseUrl: string;
  jobsSecret: string;
};

const VARIABLES = {
  r2Endpoint: 'DOJO_R2_ENDPOINT',
  r2Bucket: 'DOJO_R2_BUCKET',
  r2AccessKeyId: 'DOJO_R2_ACCESS_KEY_ID',
  r2SecretAccessKey: 'DOJO_R2_SECRET_ACCESS_KEY',
  aiApiKey: 'DOJO_AI_API_KEY',
  aiBaseUrl: 'DOJO_AI_BASE_URL',
  jobsSecret: 'DOJO_JOBS_SECRET',
} as const satisfies Record<keyof DojoEnv, string>;

/** Dojo's env when the app runs on Dojo (`DOJO=1`), otherwise `undefined`. */
export function readDojoEnv(): DojoEnv | undefined {
  if (process.env.DOJO !== '1') return undefined;

  const env = {} as DojoEnv;

  for (const [key, name] of Object.entries(VARIABLES) as [keyof DojoEnv, string][]) {
    const value = process.env[name];

    if (!value) throw new Error(`[plugin-dojo] DOJO=1 but ${name} is not set.`);

    env[key] = value;
  }

  return env;
}
