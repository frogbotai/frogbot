import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const source = await readFile(new URL('./client.ts', import.meta.url), 'utf8');

describe('@frogbotai/next client export', () => {
  it('does not create a wildcard client boundary', () => {
    expect(source).not.toContain("'use client'");
  });

  it('forwards the Payload client exports', () => {
    expect(source).toContain("export * from '@payloadcms/next/client'");
  });
});
