import type { kvAtomic } from 'frogbot/kv';
import type { kvAtomic as copyKVAtomic } from 'frogbot-copy/kv';

declare const copied: typeof copyKVAtomic;

// @ts-expect-error Each copy declares its own unique symbol, so a second copy is really loaded.
export const atomic: typeof kvAtomic = copied;
