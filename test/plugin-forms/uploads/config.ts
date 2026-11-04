import os from 'node:os';
import path from 'node:path';

import { formsPlugin } from '@frogbotai/plugin-forms';
import { APIError } from 'frogbot';

import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { ticketFiles, ticketFilesSlug, Tickets, ticketsSlug, Users } from '../shared.js';

const MiB = 1024 * 1024;

export const staticDir = path.join(os.tmpdir(), `frogbot-plugin-forms-uploads-${process.pid}`);

/** Stands in for a virus scanner: refuses any file containing this marker. */
export const infectedMarker = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR';

export default buildTestConfig({
  collections: [
    Users,
    Tickets,
    ticketFiles({
      staticDir,
      hooks: {
        beforeChange: [
          ({ data, req }) => {
            if (req.file?.data.includes(infectedMarker)) {
              throw new APIError('This file failed a virus scan.', 400);
            }

            return { ...data, note: 'scanned' };
          },
        ],
      },
    }),
  ],
  upload: { limits: { fileSize: 60 * MiB }, requestSizeLimit: 80 * MiB },
  plugins: [formsPlugin({ collections: [ticketsSlug, ticketFilesSlug] })],
});
