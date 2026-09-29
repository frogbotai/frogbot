import { createQrCode } from '@frogbotai/piece-qrcode';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const qrcode = createQrCode();

const image = qrcode.createQrCode({ input: { text: 'https://example.com' }, req });

expectTypeOf<Parameters<typeof qrcode.createQrCode>[0]['input']>().toEqualTypeOf<{
  text: string;
}>();
expectTypeOf(image).toEqualTypeOf<
  Promise<{
    id: string | number;
    name: 'qr-code.png';
    mimeType: 'image/png';
    size: number;
    url?: string | undefined;
  }>
>();
