import { CodeBlock as upstreamCodeBlock } from '@payloadcms/richtext-lexical';
import type { Field } from 'frogbot';
import type { Block as PayloadBlock } from 'payload';

type UpstreamCodeBlockArgs = NonNullable<Parameters<typeof upstreamCodeBlock>[0]>;
type CodeBlockConfig = Omit<PayloadBlock, 'fields'> & { fields: Field[] };

export type CodeBlockArgs = Omit<UpstreamCodeBlockArgs, 'fieldOverrides'> & {
  fieldOverrides?: Partial<CodeBlockConfig>;
};

export const CodeBlock = (args?: CodeBlockArgs): CodeBlockConfig => {
  const { fieldOverrides, ...options } = args ?? {};
  const block = upstreamCodeBlock(options) as unknown as CodeBlockConfig;

  block.admin = {
    ...block.admin,
    components: {
      ...block.admin?.components,
      Block: {
        clientProps: { languages: args?.languages },
        path: '@frogbotai/richtext-lexical/client#CodeBlockBlockComponent',
      },
    },
    jsx: '@frogbotai/richtext-lexical/client#codeConverterClient',
  };

  block.fields.forEach((field) => {
    if (!('name' in field) || field.name !== 'code' || !field.admin?.components?.Field) {
      return;
    }

    const component = field.admin.components.Field;
    const components = field.admin.components as Record<string, unknown>;

    components.Field = {
      ...(typeof component === 'object' ? component : {}),
      path: '@frogbotai/richtext-lexical/client#CodeComponent',
    };
  });

  return { ...block, ...fieldOverrides };
};
