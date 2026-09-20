import type { SerializedBlockNode } from '@frogbotai/richtext-lexical';
import { lexicalHTMLField } from '@frogbotai/richtext-lexical';
import type { HTMLConvertersFunctionAsync } from '@frogbotai/richtext-lexical/html-async';
import type { CollectionConfig } from 'frogbot';
import { expectTypeOf } from 'vitest';

type CalloutBlock = {
  blockName?: null | string;
  blockType: 'callout';
  message: string;
  tone: 'info' | 'warning';
};

type CalloutNode = SerializedBlockNode<CalloutBlock>;

const converters: HTMLConvertersFunctionAsync<CalloutNode> = ({ defaultConverters }) => ({
  ...defaultConverters,
  blocks: {
    callout: ({ node }) => `<aside data-tone="${node.fields.tone}">${node.fields.message}</aside>`,
  },
});

const collection: CollectionConfig = {
  slug: 'pages',
  fields: [
    { name: 'content', type: 'richText' },
    lexicalHTMLField({
      converters,
      htmlFieldName: 'html',
      lexicalFieldName: 'content',
    }),
  ],
};

expectTypeOf(collection.fields).toMatchTypeOf<CollectionConfig['fields']>();

const html = lexicalHTMLField({ htmlFieldName: 'html', lexicalFieldName: 'content' });
const _afterRead = html.hooks?.afterRead?.[0];

type HookRequest = Parameters<NonNullable<typeof _afterRead>>[0]['req'];

declare const req: HookRequest;

expectTypeOf(req.frogbot).toBeObject();
expectTypeOf<'payload'>().not.toMatchTypeOf<keyof HookRequest>();
