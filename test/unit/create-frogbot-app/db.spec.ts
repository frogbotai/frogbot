import { describe, expect, it } from 'vitest';

import { databaseUrl } from '../../../packages/create-frogbot-app/src/lib/db.js';

function databaseName(name: string): string {
  return new URL(databaseUrl('mongodb', name)).pathname.slice(1);
}

describe('MongoDB database names', () => {
  it.each(['my-app', 'app_123', 'a'.repeat(63)])('preserves normal name %s', (name) => {
    expect(databaseName(name)).toBe(name);
  });

  it.each(['frog.test-app', 'a'.repeat(64), `frog.${'long-project-'.repeat(12)}`])(
    'derives a deterministic valid short database name for %s',
    (name) => {
      const result = databaseName(name);

      expect(result).toMatch(/^[a-z0-9_-]{1,63}$/);
      expect(Buffer.byteLength(result)).toBeLessThan(64);
      expect(databaseName(name)).toBe(result);
    },
  );

  it('distinguishes normalized names and names sharing a truncated prefix', () => {
    const names = ['frog.app', 'frog-app', `${'a'.repeat(64)}b`, `${'a'.repeat(64)}c`];

    expect(new Set(names.map(databaseName)).size).toBe(names.length);
  });

  it('preserves the other database URL defaults', () => {
    expect(databaseUrl('sqlite', 'frog.app')).toBe('file:./frogbot.db');
    expect(databaseUrl('postgres', 'frog.app')).toBe(
      'postgres://postgres:postgres@127.0.0.1:5432/frog.app',
    );
  });
});
