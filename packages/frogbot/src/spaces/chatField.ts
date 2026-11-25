import { ValidationError } from 'payload';

import type { Field } from '../fields/config/types.js';
import { spaceIDOf } from './run.js';

/** The chat's `space` relationship. A person can only put a chat in a Space they can read. */
export function spaceField(spacesSlug: string): Field {
  return {
    name: 'space',
    type: 'relationship',
    relationTo: spacesSlug,
    index: true,
    admin: { position: 'sidebar' },
    hooks: {
      beforeChange: [
        async ({ collection, originalDoc, overrideAccess, req, value }) => {
          const id = spaceIDOf(value);
          const unchanged = id === spaceIDOf(originalDoc?.space);

          if (id === undefined || overrideAccess || unchanged) return value;

          const { totalDocs } = await req.frogbot.count({
            collection: spacesSlug,
            where: { id: { equals: id } },
            req,
            overrideAccess: false,
          });

          if (totalDocs === 0) {
            throw new ValidationError({
              collection: collection?.slug ?? '',
              errors: [{ path: 'space', message: 'That Space was not found.' }],
            });
          }

          return value;
        },
      ],
    },
  };
}
