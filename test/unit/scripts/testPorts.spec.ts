import { describe, expect, it } from 'vitest';

import { fetchBlockedPorts, getTestPortOffset, testPort } from '../../__helpers/shared/testPorts';

describe('test port offset', () => {
  it('uses FROGBOT_TEST_PORT_OFFSET when it is set', () => {
    const offset = getTestPortOffset({
      checkout: 'frogbot-ticket205',
      env: { CI: 'true', FROGBOT_TEST_PORT_OFFSET: '700' },
    });

    expect(offset).toBe(700);
  });

  it('rejects an offset that is not a non-negative integer', () => {
    const resolve = () =>
      getTestPortOffset({ checkout: 'frogbot', env: { FROGBOT_TEST_PORT_OFFSET: '-100' } });

    expect(resolve).toThrow('FROGBOT_TEST_PORT_OFFSET must be a non-negative integer, got -100');
  });

  it('keeps base ports in the main checkout', () => {
    expect(getTestPortOffset({ checkout: 'frogbot', env: {} })).toBe(0);
  });

  it('keeps base ports in CI', () => {
    expect(getTestPortOffset({ checkout: 'frogbot-ticket205', env: { CI: 'true' } })).toBe(0);
  });

  it.each([
    { checkout: 'frogbot-ticket205', offset: 500 },
    { checkout: 'frogbot-ticket196', offset: 4600 },
    { checkout: 'frogbot-ticket150', offset: 5000 },
  ])('derives $offset from the number ending $checkout', ({ checkout, offset }) => {
    expect(getTestPortOffset({ checkout, env: {} })).toBe(offset);
  });

  it('hashes other checkout names into a stable non-zero slot', () => {
    const offsets = ['frogbot-test-ports', 'frogbot-ticket193a', 'frogbot-ticket193b'].map(
      (checkout) => getTestPortOffset({ checkout, env: {} }),
    );

    const repeated = getTestPortOffset({ checkout: 'frogbot-test-ports', env: {} });

    expect(repeated).toBe(offsets[0]);
    expect(new Set(offsets).size).toBe(3);

    for (const offset of offsets) {
      expect(offset % 100).toBe(0);
      expect(offset).toBeGreaterThanOrEqual(100);
      expect(offset).toBeLessThanOrEqual(4900);
    }
  });

  it('never returns a port fetch blocks, and keeps ports distinct, for any worktree offset', () => {
    const offsets = Array.from({ length: 51 }, (_, slot) => slot * 100);
    const bases = Array.from({ length: 2000 }, (_, index) => 3000 + index);

    expect(testPort(3990, 200)).not.toBe(4190);

    for (const offset of offsets) {
      const ports = bases.map((base) => testPort(base, offset));

      expect(ports.filter((port) => fetchBlockedPorts.has(port))).toEqual([]);
      expect(new Set(ports).size).toBe(bases.length);
    }
  });
});
