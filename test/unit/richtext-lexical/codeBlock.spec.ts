import { CodeBlock } from '@frogbotai/richtext-lexical';
import { describe, expect, it } from 'vitest';

describe('CodeBlock', () => {
  it('uses FrogBot client component paths', () => {
    const block = CodeBlock();
    const codeField = block.fields.find((field) => 'name' in field && field.name === 'code');

    expect(block.admin?.components?.Block).toMatchObject({
      path: '@frogbotai/richtext-lexical/client#CodeBlockBlockComponent',
    });
    expect(block.admin?.jsx).toBe('@frogbotai/richtext-lexical/client#codeConverterClient');
    expect(codeField?.admin?.components?.Field).toMatchObject({
      path: '@frogbotai/richtext-lexical/client#CodeComponent',
    });
  });
});
