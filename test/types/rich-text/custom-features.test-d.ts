import {
  createNode,
  createServerFeature,
  type NodeWithHooks,
  type ServerFeature,
} from '@frogbotai/richtext-lexical';
import {
  DecoratorNode,
  type DOMExportOutput,
  type EditorConfig,
  type NodeKey,
  ParagraphNode,
  type SerializedLexicalNode,
} from '@frogbotai/richtext-lexical/lexical';
import type { Field, FrogbotRequest } from 'frogbot';
import { expectTypeOf } from 'vitest';

interface SerializedDividerNode extends SerializedLexicalNode {
  fields: { label: string };
}

class DividerNode extends DecoratorNode<null> {
  static clone(node: DividerNode): DividerNode {
    return new DividerNode(node.__label, node.__key);
  }

  static getType(): string {
    return 'divider';
  }

  static importJSON(node: SerializedLexicalNode): DividerNode {
    if ('fields' in node) {
      return new DividerNode((node as SerializedDividerNode).fields.label);
    }

    return new DividerNode();
  }

  __label: string;

  constructor(label = '', key?: NodeKey) {
    super(key);

    this.__label = label;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('hr');
  }

  decorate(): null {
    return null;
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('hr') };
  }

  exportJSON(): SerializedDividerNode {
    return { fields: { label: this.__label }, type: 'divider', version: 1 };
  }

  updateDOM(): false {
    return false;
  }
}

const fields: Field[] = [{ name: 'label', type: 'text' }];

const dividerNode = createNode({
  converters: {
    html: {
      converter: ({ node, req }) => {
        expectTypeOf(node.fields.label).toBeString();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest | null | undefined>();

        return '<hr>';
      },
      nodeTypes: ['divider'],
    },
  },
  getSubFields: ({ node, req }) => {
    expectTypeOf(node?.fields.label).toEqualTypeOf<string | undefined>();
    expectTypeOf(req).toEqualTypeOf<FrogbotRequest | undefined>();

    return fields;
  },
  getSubFieldsData: ({ node, req }) => {
    expectTypeOf(node.fields.label).toBeString();
    expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

    return node.fields;
  },
  graphQLPopulationPromises: [
    ({ node, req }) => {
      expectTypeOf(node.fields.label).toBeString();
      expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();
    },
  ],
  hooks: {
    afterRead: [
      ({ node, req }) => {
        expectTypeOf(node.fields.label).toBeString();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

        return node;
      },
    ],
    beforeChange: [
      ({ node, req }) => {
        expectTypeOf(node.fields.label).toBeString();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

        return node;
      },
    ],
    beforeValidate: [
      ({ node, req }) => {
        expectTypeOf(node.fields.label).toBeString();
        expectTypeOf(req).toEqualTypeOf<FrogbotRequest>();

        return node;
      },
    ],
  },
  node: DividerNode,
  validations: [
    ({ node }) => {
      expectTypeOf(node.fields.label).toBeString();

      return true;
    },
  ],
});

createServerFeature({
  feature: () => ({ nodes: [dividerNode] }),
  key: 'divider',
});

const paragraphNode = createNode({
  hooks: {
    afterRead: [
      ({ node }) => {
        expectTypeOf(node.children).toBeArray();

        return node;
      },
    ],
  },
  node: ParagraphNode,
});

createServerFeature({
  feature: { nodes: [dividerNode, paragraphNode] },
  key: 'heterogeneous',
});

createServerFeature<{ enabled: boolean }>({
  feature: async ({ props }) => ({
    nodes: [dividerNode, paragraphNode],
    sanitizedServerFeatureProps: props,
  }),
  key: 'asyncHeterogeneous',
});

type NodeRegistration = NonNullable<ServerFeature<undefined, undefined>['nodes']>[number];

expectTypeOf<typeof dividerNode>().toMatchTypeOf<NodeRegistration>();
expectTypeOf<typeof paragraphNode>().toMatchTypeOf<NodeRegistration>();
expectTypeOf<Record<never, never>>().not.toMatchTypeOf<NodeRegistration>();
expectTypeOf<typeof DividerNode>().not.toMatchTypeOf<NodeRegistration>();
expectTypeOf<{ node: Record<never, never> }>().not.toMatchTypeOf<NodeRegistration>();
expectTypeOf<{ node: () => undefined }>().not.toMatchTypeOf<NodeRegistration>();
expectTypeOf<{
  node: typeof DividerNode;
  hooks: { afterRead: Array<() => number> };
}>().not.toMatchTypeOf<NodeWithHooks<DividerNode>>();
