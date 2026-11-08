import type { Endpoint } from 'frogbot';

import { hasSampleData, seed } from './index';

/** `POST /api/seed`: adds the sample data for the signed-in user to an app that has none yet. */
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

      try {
        if (await hasSampleData({ frogbot: req.frogbot, req })) {
          return Response.json(
            {
              error:
                'This app already has projects, so the sample data was not added.',
            },
            { status: 409 },
          );
        }

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
