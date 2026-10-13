import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const source = await readFile(
  new URL('../../../../packages/next/src/exports/client.ts', import.meta.url),
  'utf8',
);

describe('@frogbotai/next client export', () => {
  it('only forwards the Payload client exports', () => {
    expect(source).toBe("export * from '@payloadcms/next/client';\n");
  });
});
