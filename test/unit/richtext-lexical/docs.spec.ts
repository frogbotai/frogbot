import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { type createServerFeature, ParagraphFeature } from '@frogbotai/richtext-lexical';
import { editorConfigFactory } from '@payloadcms/richtext-lexical';
import type { SanitizedConfig } from 'payload';
import { afterAll, describe, expect, it } from 'vitest';

const featureDocs = readFileSync(
  new URL('../../../docs/rich-text/custom-features.mdx', import.meta.url),
  'utf8',
);
const viewDocs = readFileSync(
  new URL('../../../docs/rich-text/views.mdx', import.meta.url),
  'utf8',
);
const dependencyExample = [...featureDocs.matchAll(/```ts\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .find((code) => code.includes('DividerFeature requires the paragraph feature'));

if (!dependencyExample) {
  throw new Error('Missing documented dependency example');
}

const packageEntry = fileURLToPath(
  new URL('../../../packages/richtext-lexical/src/index.ts', import.meta.url),
);
const exampleDir = mkdtempSync(path.join(os.tmpdir(), 'frogbot-richtext-docs-'));
const examplePath = path.join(exampleDir, 'divider-feature.mjs');

writeFileSync(
  examplePath,
  dependencyExample.replace("'@frogbotai/richtext-lexical'", JSON.stringify(packageEntry)),
);

const { DividerFeature }: { DividerFeature: ReturnType<typeof createServerFeature> } = await import(
  pathToFileURL(examplePath).href
);

afterAll(() => {
  rmSync(exampleDir, { force: true, recursive: true });
});

describe('rich text documentation examples', () => {
  it('rejects a missing paragraph feature in the exact dependency example', async () => {
    await expect(
      editorConfigFactory.fromFeatures({
        config: {} as SanitizedConfig,
        features: [DividerFeature()],
      }),
    ).rejects.toThrow('DividerFeature requires the paragraph feature');
  });

  it.each([
    { order: 'divider-first', features: [DividerFeature(), ParagraphFeature()] },
    { order: 'paragraph-first', features: [ParagraphFeature(), DividerFeature()] },
  ])('loads the exact dependency example: $order', async ({ features }) => {
    const config = await editorConfigFactory.fromFeatures({
      config: {} as SanitizedConfig,
      features,
    });

    expect(config.features.enabledFeatures).toEqual(
      expect.arrayContaining(['divider', 'paragraph']),
    );
  });

  it('puts the documented PostBody behind a client boundary', () => {
    const example = [...viewDocs.matchAll(/```tsx\n([\s\S]*?)```/g)]
      .map((match) => match[1])
      .find((code) => code.includes('export function PostBody'));

    expect(example).toMatch(/^'use client'\s/);
  });
});
