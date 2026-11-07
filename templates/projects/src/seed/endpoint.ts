import type { Endpoint } from 'frogbot';

import { hasRecords, seed } from './index';

/**
 * `POST /api/seed`: adds the sample data for the signed-in user, only while the
 * app has none of the starter's records.
 */
export function seedEndpoint(run: typeof seed = seed): Endpoint {
  return {
    path: '/seed',
    method: 'post',
    handler: async (req) => {
      if (!req.user) {
        return Response.json(
          { error: 'Sign in to seed the database.' },
          { status: 403 },
        );
      }

      if (await hasRecords(req.frogbot)) {
        return Response.json(
          { error: 'This app already has data, so there is nothing to seed.' },
          { status: 409 },
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
