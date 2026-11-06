import type { Endpoint } from 'frogbot';

import { seed } from './index';

/** `POST /api/seed`: replaces the sample data for a signed-in user, outside production. */
export function seedEndpoint(run: typeof seed = seed): Endpoint {
  return {
    path: '/seed',
    method: 'post',
    handler: async (req) => {
      if (process.env.NODE_ENV === 'production') {
        return Response.json(
          { error: 'Seeding is off in production.' },
          { status: 404 },
        );
      }

      if (!req.user) {
        return Response.json(
          { error: 'Sign in to seed the database.' },
          { status: 403 },
        );
      }

      try {
        await run({ frogbot: req.frogbot, req });
      } catch (err) {
        req.frogbot.logger.error({ err }, 'Seeding the database failed');

        return Response.json(
          { error: 'Seeding the database failed.' },
          { status: 500 },
        );
      }

      return Response.json({ success: true });
    },
  };
}
