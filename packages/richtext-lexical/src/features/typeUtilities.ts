import type { LexicalNode, SerializedLexicalNode } from '@payloadcms/richtext-lexical/lexical';

import type { ExtractSerializedNode, NodeWithHooks } from './typesServer.js';

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function createNode<
  TNode extends LexicalNode,
  TSerializedNode extends SerializedLexicalNode = ExtractSerializedNode<TNode>,
>(node: NodeWithHooks<TNode, TSerializedNode>): NodeWithHooks<TNode, TSerializedNode> {
  return node;
}
