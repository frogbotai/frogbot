import { readFileSync } from 'node:fs';

import { createServerFeature, ParagraphFeature } from '@frogbotai/richtext-lexical';
import { editorConfigFactory } from '@payloadcms/richtext-lexical';
import type { SanitizedConfig } from 'payload';
import { describe, expect, it } from 'vitest';

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

const DividerFeature = new Function(
  'createServerFeature',
  dependencyExample.replace(/^import .*$/gm, '').replace('export const DividerFeature =', 'return'),
)(createServerFeature) as ReturnType<typeof createServerFeature>;

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
