import { BlocksFeature, CodeBlock } from '@frogbotai/richtext-lexical';
import { expectTypeOf } from 'vitest';

const codeBlock = CodeBlock();

BlocksFeature({
  blocks: [codeBlock],
});

expectTypeOf(codeBlock.fields).toBeArray();

CodeBlock({
  fieldOverrides: {
    fields: [
      {
        name: 'caption',
        type: 'text',
      },
    ],
  },
});
