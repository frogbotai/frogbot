import { readFileSync } from 'node:fs';

import { describe } from 'vitest';

export const LIVE = process.env.RUN_E2E === '1';

export function missingKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !process.env[key]);
}

export function describeLive(
  name: string,
  { keys }: { keys: readonly string[] },
  fn: () => void,
): void {
  const missing = missingKeys(keys);

  if (!LIVE) {
    describe.skip(name, fn);

    return;
  }

  if (missing.length === 0) {
    describe(name, fn);

    return;
  }

  describe.skip(`${name} (missing ${missing.join(', ')})`, fn);
}

export type LiveFixture = 'agreement.pdf' | 'receipt.png' | 'shapes.png' | 'speech.wav';

const MEDIA_TYPES: Record<LiveFixture, string> = {
  'agreement.pdf': 'application/pdf',
  'receipt.png': 'image/png',
  'shapes.png': 'image/png',
  'speech.wav': 'audio/wav',
};

export function readFixture(name: LiveFixture): Buffer {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
}

export function fixtureBase64(name: LiveFixture): string {
  return readFixture(name).toString('base64');
}

export function fixtureDataUrl(name: LiveFixture): string {
  return `data:${MEDIA_TYPES[name]};base64,${fixtureBase64(name)}`;
}

export function fixtureFile(name: LiveFixture): File {
  return new File([readFixture(name)], name, { type: MEDIA_TYPES[name] });
}

export const FIXTURE_FACTS = {
  receiptTotal: /42\.17/,
  cafeName: /frogbot/i,
  circleColor: /red/i,
  squareColor: /blue/i,
  renewalCode: /LILYPAD-7731/,
  speech: /brown frog/i,
} as const;
