import { convertLexicalToHTML, createNode, createServerFeature } from '@frogbotai/richtext-lexical';
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
  it('registers heterogeneous nodes and converts without a request', async () => {
    const requests: unknown[] = [];
    const paragraph = createNode({
      converters: {
        html: {
          converter: ({ node, req }) => {
            requests.push(req);

            return `<p>${req?.frogbot ? 'online' : 'offline'}: ${node.children.length}</p>`;
          },
          nodeTypes: ['paragraph'],
        },
      },
      node: ParagraphNode,
    });
    const text = createNode({ node: TextNode });
    const Feature = createServerFeature({
      feature: { nodes: [paragraph, text] },
      key: 'heterogeneous',
    });
    const config = await editorConfigFactory.fromFeatures({
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

    const html = await convertLexicalToHTML({
      converters: config.features.converters.html,
      data: editor.getEditorState().toJSON(),
    });

    expect(config.features.nodes.map(({ node }) => node)).toEqual([ParagraphNode, TextNode]);
    expect(requests).toEqual([undefined]);
    expect(html).toBe('<p>offline: 1</p>');
  });
});
