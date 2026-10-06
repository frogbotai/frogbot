import type {
  CollectionConfig,
  FrogBot,
  FrogBotRequest,
  UploadConfig,
  UploadHandler,
} from 'frogbot';
import type { UploadConfig as PayloadUploadConfig } from 'payload';
import { expectTypeOf } from 'vitest';

type PayloadUploadHandler = NonNullable<PayloadUploadConfig['handlers']>[number];

expectTypeOf<keyof UploadConfig>().toEqualTypeOf<keyof PayloadUploadConfig>();
expectTypeOf<NonNullable<UploadConfig['handlers']>>().toEqualTypeOf<UploadHandler[]>();
expectTypeOf<Parameters<UploadHandler>[0]>().toEqualTypeOf<FrogBotRequest>();
expectTypeOf<Parameters<UploadHandler>[1]>().toEqualTypeOf<Parameters<PayloadUploadHandler>[1]>();
expectTypeOf<ReturnType<UploadHandler>>().toEqualTypeOf<ReturnType<PayloadUploadHandler>>();

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    handlers: [
      (req, { params }) => {
        expectTypeOf(req.frogbot).toEqualTypeOf<FrogBot>();

        return Promise.resolve(Response.json({ filename: params.filename, user: req.user?.id }));
      },
      (req) => {
        // @ts-expect-error FrogBot requests don't expose req.payload.
        void req.payload;
      },
    ],
  },
  fields: [],
};
