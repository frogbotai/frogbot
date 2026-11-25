import {
  mentionedIds,
  MentionFeature,
  mentionInitials,
  type SerializedMentionNode,
} from '@frogbotai/richtext-lexical';
import { $createMentionNode, MentionNode } from '@frogbotai/richtext-lexical/client';
import { convertLexicalToHTML, MentionHTMLConverter } from '@frogbotai/richtext-lexical/html';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from '@frogbotai/richtext-lexical/lexical';
import { createHeadlessEditor } from '@frogbotai/richtext-lexical/lexical/headless';
import {
  convertLexicalToPlaintext,
  MentionPlaintextConverter,
} from '@frogbotai/richtext-lexical/plaintext';
import {
  type DefaultNodeTypes,
  type JSXConvertersFunction,
  MentionJSXConverter,
  RichText,
} from '@frogbotai/richtext-lexical/react';
import { editorConfigFactory } from '@payloadcms/richtext-lexical';
import type { SanitizedConfig } from 'payload';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

const config = {
  admin: { user: 'people' },
  collections: [
    { slug: 'people', auth: {}, admin: { useAsTitle: 'name' } },
    { slug: 'posts', admin: {} },
  ],
} as unknown as SanitizedConfig;

const mention = (value: number | string, label: string): SerializedMentionNode => ({
  label,
  relationTo: 'people',
  type: 'mention',
  value,
  version: 1,
});

const state = {
  root: {
    children: [
      {
        children: [
          mention(7, 'Sam'),
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' can you check?',
            type: 'text',
            version: 1,
          },
          mention(9, 'Ana'),
          mention(7, 'Sam'),
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

describe('MentionFeature', () => {
  it('searches the admin user collection by its title field', () => {
    const editorConfig = editorConfigFactory.fromFeatures({ config, features: [MentionFeature()] });
    const feature = editorConfig.resolvedFeatureMap.get('mention');

    expect(feature?.clientFeatureProps).toEqual({
      api: '/api',
      avatar: 'gravatar',
      relationTo: 'people',
      titleField: 'name',
    });
    expect(feature?.ClientFeature).toBe('@frogbotai/richtext-lexical/client#MentionFeatureClient');
    expect(editorConfig.features.nodes.map(({ node }) => node)).toContain(MentionNode);
  });

  it('rejects a collection that does not exist', () => {
    expect(() =>
      editorConfigFactory.fromFeatures({
        config,
        features: [MentionFeature({ relationTo: 'ghosts' })],
      }),
    ).toThrow("Collection 'ghosts' does not exist");
  });

  it('round-trips a mention through a headless editor', () => {
    const editor = createHeadlessEditor({ nodes: [MentionNode] });

    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createMentionNode({ label: 'Sam', relationTo: 'people', value: 7 }),
            $createTextNode(' hi'),
          ),
        );
      },
      { discrete: true },
    );

    const json = editor.getEditorState().toJSON();
    const paragraph = json.root.children[0] as unknown as { children: unknown[] };

    expect(paragraph.children[0]).toEqual(mention(7, 'Sam'));
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('@Sam hi');
  });

  it('collects each mentioned id once, in order', () => {
    expect(mentionedIds(state)).toEqual([7, 9]);
    expect(mentionedIds(null)).toEqual([]);
    expect(mentionedIds({ root: { children: [{ type: 'mention', value: '' }] } })).toEqual(['']);
  });

  it('renders @Name with the plain-text, HTML and JSX converters', () => {
    const data = state as unknown as Parameters<typeof convertLexicalToPlaintext>[0]['data'];

    expect(convertLexicalToPlaintext({ converters: MentionPlaintextConverter, data })).toBe(
      '@Sam can you check?@Ana@Sam',
    );

    const html = convertLexicalToHTML({
      converters: ({ defaultConverters }) => ({ ...defaultConverters, ...MentionHTMLConverter }),
      data,
      disableContainer: true,
    });

    expect(html).toContain('<span class="mention" data-id="7">@Sam</span>');

    const jsxConverters: JSXConvertersFunction<DefaultNodeTypes> = ({ defaultConverters }) => ({
      ...defaultConverters,
      ...MentionJSXConverter,
    });

    const jsx = renderToStaticMarkup(
      createElement(RichText<DefaultNodeTypes>, { converters: jsxConverters, data }),
    );

    expect(jsx).toContain(
      '<span class="mention" data-id="9"><span aria-hidden="true" class="fb-mention__avatar">A</span><span class="fb-mention__name">Ana</span></span>',
    );
  });

  it('escapes names in HTML', () => {
    const html = convertLexicalToHTML({
      converters: ({ defaultConverters }) => ({ ...defaultConverters, ...MentionHTMLConverter }),
      data: {
        root: {
          ...state.root,
          children: [{ ...state.root.children[0], children: [mention('1"', '<b>')] }],
        },
      } as unknown as Parameters<typeof convertLexicalToHTML>[0]['data'],
      disableContainer: true,
    });

    expect(html).toContain('data-id="1&quot;">@&lt;b&gt;</span>');
  });
});

describe('mentionInitials', () => {
  it('takes up to two initials from a name, or the first letter of an email', () => {
    expect(mentionInitials('Sam Lee')).toBe('SL');
    expect(mentionInitials('Ana')).toBe('A');
    expect(mentionInitials('ro@example.com')).toBe('R');
    expect(mentionInitials('')).toBe('?');
  });
});
