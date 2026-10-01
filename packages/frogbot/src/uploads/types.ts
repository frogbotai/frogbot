import type { UploadConfig as PayloadUploadConfig } from 'payload';

import type { FrogBotRequest } from '../types/request.js';

type PayloadUploadHandler = NonNullable<PayloadUploadConfig['handlers']>[number];

export type UploadHandler = (
  req: FrogBotRequest,
  args: Parameters<PayloadUploadHandler>[1],
) => ReturnType<PayloadUploadHandler>;

export type UploadConfig = Omit<PayloadUploadConfig, 'handlers'> & {
  handlers?: UploadHandler[];
};

export type SanitizedFilesConfig = {
  slug: string;
};
