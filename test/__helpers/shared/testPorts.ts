import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainCheckout = 'frogbot';
const slots = 50;
const step = 100;

export function getTestPortOffset({
  checkout,
  env,
}: {
  checkout: string;
  env: Record<string, string | undefined>;
}): number {
  const override = env.FROGBOT_TEST_PORT_OFFSET;

  if (override) {
    const offset = Number(override);

    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(`FROGBOT_TEST_PORT_OFFSET must be a non-negative integer, got ${override}`);
    }

    return offset;
  }

  if (env.CI || checkout === mainCheckout) return 0;

  const number = checkout.match(/\d+$/)?.[0];

  if (number) return (Number(number) % slots || slots) * step;

  const hash = createHash('sha256').update(checkout).digest().readUInt32BE(0);

  return ((hash % (slots - 1)) + 1) * step;
}

export const testPortOffset = getTestPortOffset({
  checkout: basename(fileURLToPath(new URL('../../../', import.meta.url))),
  env: process.env,
});

export function testPort(base: number): number {
  return base + testPortOffset;
}

export function testDatabaseName(name: string): string {
  return testPortOffset ? `${name}_wt${testPortOffset}` : name;
}
