import { createCrypto } from '@frogbotai/piece-crypto';
import type { FrogBotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

declare const req: FrogBotRequest;

const crypto = createCrypto();

const hash = crypto.hashText({ input: { method: 'sha256', text: 'frog' }, req });

expectTypeOf<Parameters<typeof crypto.hashText>[0]['input']>().toEqualTypeOf<{
  method: 'md5' | 'sha256' | 'sha512' | 'sha3-512';
  text: string;
}>();
expectTypeOf(hash).toEqualTypeOf<Promise<string>>();

// @ts-expect-error hashText does not accept encodeBase64 input
crypto.hashText({ input: { text: 'frog' }, req });
