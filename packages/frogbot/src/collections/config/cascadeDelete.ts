import { toPayloadRequest } from '../../seams/request.js';
import type { CollectionConfig } from './types.js';

export type CascadeDeleteProps = {
  collection: string;
  field: string;
};

/** Appends a `beforeDelete` hook, after the collection's own, that deletes every `collection` document whose `field` points at the deleted document, in the same transaction. */
export function cascadeDelete(
  config: CollectionConfig,
  { collection, field }: CascadeDeleteProps,
): CollectionConfig {
  return {
    ...config,
    hooks: {
      ...config.hooks,
      beforeDelete: [
        ...(config.hooks?.beforeDelete ?? []),
        async ({ id, req }) => {
          const payloadReq = toPayloadRequest(req);

          const result = await payloadReq.payload.delete({
            collection,
            where: { [field]: { equals: id } },
            req: payloadReq,
            overrideAccess: true,
            trash: true,
            depth: 0,
          });

          const [error] = result.errors;
          if (error) {
            throw new Error(
              `[frogbot] Could not delete ${collection} for ${config.slug} ${id}: ${error.message}`,
            );
          }
        },
      ],
    },
  };
}
