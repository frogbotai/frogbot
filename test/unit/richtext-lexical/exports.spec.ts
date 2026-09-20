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
});
