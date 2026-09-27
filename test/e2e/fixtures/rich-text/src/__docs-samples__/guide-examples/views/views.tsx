'use client';

import type {
  DefaultNodeTypes,
  LexicalEditorViewMap,
  SerializedBlockNode,
  SerializedInlineBlockNode,
  ViewMapBlockComponentProps,
} from '@frogbotai/richtext-lexical';
import { $isHeadingNode } from '@frogbotai/richtext-lexical/lexical/rich-text';

type BannerBlock = {
  blockName?: string;
  blockType: 'banner';
  message: string;
};

type BadgeBlock = {
  blockName?: string;
  blockType: 'badge';
  label: string;
};

export type PostNodeTypes =
  DefaultNodeTypes | SerializedBlockNode<BannerBlock> | SerializedInlineBlockNode<BadgeBlock>;

function getEditorField(node: unknown, name: string): string {
  if (typeof node !== 'object' || node === null || !('__fields' in node)) {
    return '';
  }

  const fields = node.__fields;

  if (typeof fields !== 'object' || fields === null) {
    return '';
  }

  return String(Reflect.get(fields, name) ?? '');
}

export const postViews: LexicalEditorViewMap<PostNodeTypes> = {
  default: {
    nodes: {},
  },
  preview: {
    admin: {
      hideGutter: true,
    },
    filterFeatures: (features) => {
      const {
        toolbarFixed: _toolbarFixed,
        toolbarInline: _toolbarInline,
        ...previewFeatures
      } = features;

      return previewFeatures;
    },
    lexical: (defaultConfig) => ({
      ...defaultConfig,
      theme: {
        ...defaultConfig.theme,
        link: 'post-preview-link',
        paragraph: 'post-preview-paragraph',
      },
    }),
    nodes: {
      heading: {
        createDOM: ({ node }) => {
          if (!$isHeadingNode(node)) {
            return document.createElement('div');
          }

          const heading = document.createElement(node.getTag());

          heading.className = 'post-preview-heading';

          return heading;
        },
      },
      blocks: {
        banner: {
          Component: ({ node, isEditor }) => {
            const message = isEditor ? getEditorField(node, 'message') : node.fields.message;

            return <aside className="post-preview-banner">{message}</aside>;
          },
        },
      },
      inlineBlocks: {
        badge: {
          Component: ({ node, isEditor }) => {
            const label = isEditor ? getEditorField(node, 'label') : node.fields.label;

            return <span className="post-preview-badge">{label}</span>;
          },
        },
      },
    },
  },
  minimal: {
    lexical: {
      namespace: 'post-minimal-view',
      theme: {
        paragraph: 'post-minimal-paragraph',
      },
    },
    nodes: {},
  },
};

type BannerNode = SerializedBlockNode<BannerBlock>;

export function BannerViewBlock(props: ViewMapBlockComponentProps<BannerNode>) {
  if (props.isEditor) {
    const { BlockCollapsible, EditButton, RemoveButton } = props.useBlockComponentContext();

    return (
      <BlockCollapsible>
        <p>{props.formData.message}</p>
        <EditButton />
        <RemoveButton />
      </BlockCollapsible>
    );
  }

  return <aside className="post-banner">{props.formData.message}</aside>;
}
