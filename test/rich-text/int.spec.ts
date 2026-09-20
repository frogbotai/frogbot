import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BlocksFeature,
  convertLexicalToMarkdown,
  convertMarkdownToLexical,
  editorConfigFactory,
  HeadingFeature,
} from '@frogbotai/richtext-lexical';
import type { SerializedEditorState } from '@frogbotai/richtext-lexical/lexical';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import config, { CalloutBlock, InlineCodeBlock } from './config.js';
import { articlesSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function paragraph(text: string): SerializedEditorState {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  };
}

describe('rich text integration [sqlite]', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('creates, reads, and updates Lexical editor state', async () => {
    const initial = paragraph('First version');

    const created = await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'CRUD', content: initial },
      overrideAccess: true,
    });

    const found = await booted.frogbot.findByID({
      collection: articlesSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(found.content).toEqual(initial);

    const updatedState = paragraph('Second version');

    await booted.frogbot.update({
      collection: articlesSlug,
      id: created.id,
      data: { content: updatedState },
      overrideAccess: true,
    });

    const updated = await booted.frogbot.findByID({
      collection: articlesSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(updated.content).toEqual(updatedState);

    await booted.frogbot.delete({
      collection: articlesSlug,
      id: created.id,
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.findByID({
        collection: articlesSlug,
        id: created.id,
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });

  it('uses root and field-level Lexical editor configurations', async () => {
    const rootFeatures = (await editorConfigFactory.default({ config })).features.enabledFeatures;
    const overrideFeatures = (
      await editorConfigFactory.fromFeatures({ config, features: () => [HeadingFeature()] })
    ).features.enabledFeatures;

    expect(rootFeatures).toContain('bold');
    expect(overrideFeatures).toContain('heading');
    expect(overrideFeatures).not.toContain('bold');
  });

  it('round trips Markdown through the configured editor', async () => {
    const editorConfig = await editorConfigFactory.default({ config });
    const state = convertMarkdownToLexical({
      editorConfig,
      markdown: '# FrogBot\n\n**Rich** content.',
    });
    const markdown = convertLexicalToMarkdown({ data: state, editorConfig });

    expect(markdown).toContain('# FrogBot');
    expect(markdown).toContain('**Rich** content.');
  });

  it('round trips custom MDX blocks with nested rich text and inline blocks', async () => {
    const editorConfig = await editorConfigFactory.fromFeatures({
      config,
      features: ({ defaultFeatures }) => [
        ...defaultFeatures,
        BlocksFeature({ blocks: [CalloutBlock], inlineBlocks: [InlineCodeBlock] }),
      ],
    });
    const source =
      '<Callout tone="warning">Nested **copy** with <InlineCode>pnpm test</InlineCode>.</Callout>';
    const state = convertMarkdownToLexical({ editorConfig, markdown: source });
    const markdown = convertLexicalToMarkdown({ data: state, editorConfig });

    expect(markdown).toContain('<Callout tone="warning">');
    expect(markdown).toContain('Nested **copy** with <InlineCode>pnpm test</InlineCode>.');
    expect(markdown).toContain('</Callout>');
  });
});
