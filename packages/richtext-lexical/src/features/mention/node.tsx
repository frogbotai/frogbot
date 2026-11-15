import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
} from '@payloadcms/richtext-lexical/lexical';
import type { JSX } from 'react';

import { type MentionData, mentionText, type SerializedMentionNode } from './shared.js';

/** An inline mention of a user, shown as `@Name` in the editor. */
export class MentionNode extends DecoratorNode<JSX.Element> {
  __data: MentionData;

  constructor(data: MentionData, key?: NodeKey) {
    super(key);
    this.__data = data;
  }

  static override getType(): string {
    return 'mention';
  }

  static override clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__data, node.__key);
  }

  static override importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode({
      label: serialized.label,
      relationTo: serialized.relationTo,
      value: serialized.value,
    });
  }

  static override importDOM(): DOMConversionMap<HTMLSpanElement> {
    return {
      span: (element) =>
        element.hasAttribute('data-mention-id')
          ? {
              conversion: () => ({
                node: $createMentionNode({
                  label: (element.textContent ?? '').replace(/^@/, ''),
                  relationTo: element.getAttribute('data-mention-relation-to') ?? '',
                  value: element.getAttribute('data-mention-id') ?? '',
                }),
              }),
              priority: 2,
            }
          : null,
    };
  }

  override exportJSON(): SerializedMentionNode {
    return { ...this.getData(), type: 'mention', version: 1 };
  }

  override exportDOM(): DOMExportOutput {
    const element = document.createElement('span');

    element.setAttribute('data-mention-id', String(this.__data.value));
    element.setAttribute('data-mention-relation-to', this.__data.relationTo);
    element.textContent = mentionText(this.__data);

    return { element };
  }

  override createDOM(): HTMLElement {
    const element = document.createElement('span');

    element.className = 'fb-mention';

    return element;
  }

  override updateDOM(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override getTextContent(): string {
    return mentionText(this.__data);
  }

  getData(): MentionData {
    return this.getLatest().__data;
  }

  override decorate(): JSX.Element {
    return <span data-mention-id={String(this.__data.value)}>{mentionText(this.__data)}</span>;
  }
}

/** Creates a mention node for `data`. */
export function $createMentionNode(data: MentionData): MentionNode {
  return $applyNodeReplacement(new MentionNode(data));
}

/** Whether `node` is a mention. */
export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
