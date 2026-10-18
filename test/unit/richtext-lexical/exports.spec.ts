import { access, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const manifestURL = new URL('../../../packages/richtext-lexical/package.json', import.meta.url);
const upstreamManifestURL = new URL(
  '../../../packages/richtext-lexical/node_modules/@payloadcms/richtext-lexical/package.json',
  import.meta.url,
);

describe('@frogbotai/richtext-lexical exports', () => {
  it('mirrors every installed upstream key except migration and internal client entries', async () => {
    const manifest = JSON.parse(await readFile(manifestURL, 'utf8')) as {
      exports: Record<string, unknown>;
      publishConfig: { exports: Record<string, unknown> };
    };

    const upstreamManifest = JSON.parse(await readFile(upstreamManifestURL, 'utf8')) as {
      exports: Record<string, unknown>;
    };

    const expected = Object.keys(upstreamManifest.exports).filter(
      (key) => key !== './migrate' && key !== './internal-client',
    );

    expect(Object.keys(manifest.exports)).toEqual(expected);
    expect(Object.keys(manifest.publishConfig.exports)).toEqual(expected);
    expect(Object.values(manifest.publishConfig.exports)).toEqual(
      Object.values(manifest.exports).map((target) =>
        String(target).replace('./src/', './dist/').replace(/\.ts$/, '.js'),
      ),
    );
    expect(Object.keys(manifest.exports).some((key) => key.includes('*'))).toBe(false);

    await Promise.all(
      Object.values(manifest.exports).map((target) =>
        access(new URL(`../../../packages/richtext-lexical/${String(target)}`, import.meta.url)),
      ),
    );
  });

  it('re-exports with export * only from entries that are not client boundaries', async () => {
    const manifest = JSON.parse(await readFile(manifestURL, 'utf8')) as {
      exports: Record<string, string>;
    };

    const boundaries = [];

    for (const target of Object.values(manifest.exports)) {
      const source = await readFile(
        new URL(`../../../packages/richtext-lexical/${target}`, import.meta.url),
        'utf8',
      );

      if (/^['"]use client['"]/m.test(source) && /^export \* from/m.test(source)) {
        boundaries.push(target);
      }
    }

    expect(boundaries).toEqual([]);
  });
});
