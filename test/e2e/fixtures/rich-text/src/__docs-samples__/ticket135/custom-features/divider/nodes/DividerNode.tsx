import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from '@frogbotai/richtext-lexical/lexical';
import { $applyNodeReplacement, DecoratorNode } from '@frogbotai/richtext-lexical/lexical';
import { lazy, type ReactElement } from 'react';

export type SerializedDividerNode = SerializedLexicalNode & {
  fields: {
    title: string;
  };
};

const DividerComponent = lazy(() =>
  import('../components/DividerComponent').then((module) => ({
    default: module.DividerComponent,
  })),
);

export class DividerNode extends DecoratorNode<ReactElement> {
  static clone(node: DividerNode): DividerNode {
    return new DividerNode(node.__title, node.__key);
  }

  static getType(): string {
    return 'divider';
  }

  static importDOM(): DOMConversionMap {
    return {
      hr: () => ({ conversion: convertDividerElement, priority: 0 }),
    };
  }

  static importJSON(serializedNode: SerializedDividerNode): DividerNode {
    return $createDividerNode(serializedNode.fields.title);
  }

  __title: string;

  constructor(title = 'Divider', key?: NodeKey) {
    super(key);

    this.__title = title;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('div');
  }

  decorate(): ReactElement {
    return <DividerComponent />;
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement('hr') };
  }

  exportJSON(): SerializedDividerNode {
    return {
      fields: { title: this.__title },
      type: 'divider',
      version: 1,
    };
  }

  getTextContent(): string {
    return '\n';
  }

  isInline(): false {
    return false;
  }

  updateDOM(): false {
    return false;
  }
}

function convertDividerElement(): DOMConversionOutput {
  return { node: $createDividerNode() };
}

export function $createDividerNode(title?: string): DividerNode {
  return $applyNodeReplacement(new DividerNode(title));
}

export function $isDividerNode(node: LexicalNode | null | undefined): node is DividerNode {
  return node instanceof DividerNode;
}
