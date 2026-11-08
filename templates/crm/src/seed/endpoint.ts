import type { Endpoint } from 'frogbot';

import { hasRecords, seed } from './index';

let seeding = false;

/**
 * `POST /api/seed`: adds the sample data for a signed-in user while the CRM is empty.
 * It answers 404 in production, so a deployed app never offers it.
 */
export function seedEndpoint(run: typeof seed = seed): Endpoint {
  return {
    path: '/seed',
    method: 'post',
    handler: async (req) => {
      if (process.env.NODE_ENV === 'production') {
        return Response.json({ error: 'Not found.' }, { status: 404 });
      }

      if (!req.user) {
        return Response.json(
          { error: 'Sign in to load the sample data.' },
          { status: 403 },
        );
      }

      if (seeding || (await hasRecords(req.frogbot))) {
        return Response.json(
          {
            error:
              'Your CRM already has records, so the sample was not added. It only loads into an empty CRM.',
          },
          { status: 409 },
        );
      }

      seeding = true;

      try {
        await run({ frogbot: req.frogbot, req, today: new Date() });
      } catch (err) {
        req.frogbot.logger.error({ err }, 'Seeding the database failed');

        return Response.json(
          { error: 'Seeding the database failed.' },
          { status: 500 },
        );
      } finally {
        seeding = false;
      }

      return Response.json({ success: true });
    },
  };
}
