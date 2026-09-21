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

  it.each([
    '/components/Code#Block',
    { path: '/components/Code#Block', clientProps: { theme: 'custom' } },
  ])('preserves an explicit block component override: %j', (Block) => {
    const block = CodeBlock({ fieldOverrides: { admin: { components: { Block } } } });

    expect(block.admin?.components?.Block).toBe(Block);
  });

  it('preserves an explicit client converter override', () => {
    const jsx = { path: '/components/Code#converter', clientProps: { theme: 'custom' } };
    const block = CodeBlock({ fieldOverrides: { admin: { jsx } } });

    expect(block.admin?.jsx).toBe(jsx);
  });

  it.each([
    '/components/Code#Field',
    { path: '/components/Code#Field', clientProps: { theme: 'custom' } },
  ])('preserves an explicit code field component override: %j', (Field) => {
    const block = CodeBlock({
      fieldOverrides: {
        fields: [{ name: 'code', type: 'code', admin: { components: { Field } } }],
      },
    });

    expect(block.fields[0].admin?.components?.Field).toBe(Field);
  });

  it('preserves an explicitly empty admin configuration', () => {
    const block = CodeBlock({ fieldOverrides: { admin: {} } });

    expect(block.admin).toEqual({});
  });

  it('retains language and TypeScript props when rewriting built-in paths', () => {
    const languages = { ts: 'TypeScript' };
    const typescript = { enableSemanticValidation: true };
    const block = CodeBlock({ languages, typescript });
    const codeField = block.fields.find((field) => 'name' in field && field.name === 'code');

    expect(block.admin?.components?.Block).toMatchObject({ clientProps: { languages } });
    expect(codeField?.admin?.components?.Field).toMatchObject({
      clientProps: { languages, typescript },
    });
  });
});
