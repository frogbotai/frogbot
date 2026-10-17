'use client';

import {
  $applyNodeReplacement,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { ReactNode } from 'react';

import type { ComposerMention } from './prompt.js';

export type MentionValue = Omit<ComposerMention, 'start' | 'end'>;

type SerializedMentionNode = Spread<{ mention: MentionValue }, SerializedLexicalNode>;

export class MentionNode extends DecoratorNode<ReactNode> {
  __mention: MentionValue;

  static getType() {
    return 'frogbot-mention';
  }

  static clone(node: MentionNode) {
    return new MentionNode(node.__mention, node.__key);
  }

  static importJSON(json: SerializedMentionNode) {
    return $createMentionNode(json.mention);
  }

  constructor(mention: MentionValue, key?: NodeKey) {
    super(key);
    this.__mention = mention;
  }

  exportJSON(): SerializedMentionNode {
    return { ...super.exportJSON(), mention: this.__mention };
  }

  createDOM() {
    const element = document.createElement('span');

    element.className = 'fb-composer-mention';
    element.contentEditable = 'false';

    return element;
  }

  updateDOM() {
    return false;
  }

  getMention() {
    return this.getLatest().__mention;
  }

  getTextContent() {
    return `@${this.__mention.label}`;
  }

  isInline() {
    return true;
  }

  isKeyboardSelectable() {
    return false;
  }

  decorate() {
    return this.getTextContent();
  }
}

export function $createMentionNode(mention: MentionValue) {
  return $applyNodeReplacement(new MentionNode(mention));
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode;
}
