import { createImageHelper } from '@frogbotai/piece-image-helper';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const imageHelper = createImageHelper();

const _rotated = imageHelper.rotate({ input: { image: 1, degrees: 90 }, req });

expectTypeOf<Parameters<typeof imageHelper.rotate>[0]['input']>().toEqualTypeOf<{
  image: string | number;
  degrees: 90 | 180 | 270;
  resultFileName?: string | undefined;
}>();

expectTypeOf<Awaited<typeof _rotated>['id']>().toEqualTypeOf<string | number>();

const _rotateRejectsImageToBase64Input = () =>
  // @ts-expect-error rotate does not accept imageToBase64 input
  imageHelper.rotate({ input: { image: 1, mimeType: 'image/png' }, req });

expectTypeOf(imageHelper.imageToBase64({ input: { image: 1 }, req })).toEqualTypeOf<
  Promise<string>
>();
