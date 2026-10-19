import { createHash, timingSafeEqual } from 'node:crypto';

import type { FrogBotConfig } from 'frogbot';
import type { PayloadRequest } from 'payload';

import type { DojoEnv } from './env.js';

type RunAccess = (args: { req: PayloadRequest }) => boolean | Promise<boolean>;

const digest = (value: string) => createHash('sha256').update(value).digest();

const defaultRunAccess: RunAccess = ({ req: { payload, user } }) =>
  Boolean(user) && user!.collection === payload.config.admin.user;

/**
 * Lets Dojo run due jobs with `Authorization: Bearer <DOJO_JOBS_SECRET>`. Everyone else gets the
 * app's `jobs.access.run`, or Payload's default rule, copied because Payload doesn't export it
 * (`payload/src/auth/defaultAccess.ts`).
 */
export function withDojoJobs(config: FrogBotConfig, env: DojoEnv): FrogBotConfig {
  const run: RunAccess = config.jobs?.access?.run ?? defaultRunAccess;
  const expected = digest(`Bearer ${env.jobsSecret}`);

  return {
    ...config,
    jobs: {
      ...config.jobs,
      access: {
        ...config.jobs?.access,
        run: (args) => {
          const header = args.req.headers.get('authorization');

          if (header !== null && timingSafeEqual(digest(header), expected)) return true;

          return run(args);
        },
      },
    },
  };
}
