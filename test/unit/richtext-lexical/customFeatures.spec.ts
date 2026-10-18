import { createNode, createServerFeature } from '@frogbotai/richtext-lexical';
import { convertLexicalToHTML } from '@frogbotai/richtext-lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  ParagraphNode,
  TextNode,
} from '@frogbotai/richtext-lexical/lexical';
import { createHeadlessEditor } from '@frogbotai/richtext-lexical/lexical/headless';
import { editorConfigFactory } from '@payloadcms/richtext-lexical';
import type { SanitizedConfig } from 'payload';
import { describe, expect, it } from 'vitest';

describe('custom server features', () => {
  it('registers heterogeneous nodes and converts them with the HTML converters', () => {
    const paragraph = createNode({ node: ParagraphNode });

    const text = createNode({ node: TextNode });
    const Feature = createServerFeature({
      feature: { nodes: [paragraph, text] },
      key: 'heterogeneous',
    });

    const config = editorConfigFactory.fromFeatures({
      config: {} as SanitizedConfig,
      features: [Feature()],
    });

    const editor = createHeadlessEditor({
      nodes: config.features.nodes.map(({ node }) => node),
    });

    editor.update(
      () => {
        $getRoot().append($createParagraphNode().append($createTextNode('Custom content')));
      },
      { discrete: true },
    );

    const html = convertLexicalToHTML({
      // @ts-expect-error Payload 4.0.0-beta.2 rejects overriding a default converter (F-238, to report upstream); drop this when it accepts it.
      converters: ({ defaultConverters }) => ({
        ...defaultConverters,
        paragraph: ({ node }) => `<p>children: ${node.children.length}</p>`,
      }),
      data: editor.getEditorState().toJSON(),
    });

    expect(config.features.nodes.map(({ node }) => node)).toEqual([ParagraphNode, TextNode]);
    expect(html).toBe('<div class="payload-richtext"><p>children: 1</p></div>');
  });
});
