import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainCheckout = 'frogbot';
const slots = 50;
const step = 100;
// https://fetch.spec.whatwg.org/#port-blocking: `fetch` refuses these, so a stub server on one is unreachable.
export const fetchBlockedPorts = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);
// Blocked ports move up by this much, past every offset port and below the ephemeral ranges.
const blockedPortShift = 20_000;

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

export function testPort(base: number, offset = testPortOffset): number {
  const port = base + offset;

  return fetchBlockedPorts.has(port) ? port + blockedPortShift : port;
}

export function testDatabaseName(name: string): string {
  return testPortOffset ? `${name}_wt${testPortOffset}` : name;
}
