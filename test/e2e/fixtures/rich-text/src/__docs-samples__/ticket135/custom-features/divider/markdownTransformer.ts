import type { ElementTransformer } from '@frogbotai/richtext-lexical/lexical/markdown';

import { $createDividerNode, $isDividerNode, DividerNode } from './nodes/DividerNode';

export const DividerMarkdownTransformer: ElementTransformer = {
  dependencies: [DividerNode],
  export: (node) => ($isDividerNode(node) ? '+++' : null),
  regExp: /^\+\+\+\s*$/,
  replace: (parentNode) => {
    parentNode.replace($createDividerNode());
  },
  type: 'element',
};
