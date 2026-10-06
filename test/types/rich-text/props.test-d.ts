import type {
  LexicalBlockClientProps,
  LexicalBlockLabelClientProps,
  LexicalBlockLabelServerProps,
  LexicalBlockServerProps,
  LexicalInlineBlockClientProps,
  LexicalInlineBlockLabelClientProps,
  LexicalInlineBlockLabelServerProps,
  LexicalInlineBlockServerProps,
} from '@frogbotai/richtext-lexical';
import { expectTypeOf } from 'vitest';

declare const block: LexicalBlockServerProps;
declare const blockLabel: LexicalBlockLabelServerProps;
declare const inlineBlock: LexicalInlineBlockServerProps;
declare const inlineBlockLabel: LexicalInlineBlockLabelServerProps;

expectTypeOf(block.req.frogbot).toBeObject();
expectTypeOf(blockLabel.req.frogbot).toBeObject();
expectTypeOf(inlineBlock.req.frogbot).toBeObject();
expectTypeOf(inlineBlockLabel.req.frogbot).toBeObject();

expectTypeOf<'payload'>().not.toMatchTypeOf<keyof typeof block.req>();
expectTypeOf<'payload'>().not.toMatchTypeOf<keyof typeof blockLabel.req>();
expectTypeOf<'payload'>().not.toMatchTypeOf<keyof typeof inlineBlock.req>();
expectTypeOf<'payload'>().not.toMatchTypeOf<keyof typeof inlineBlockLabel.req>();

expectTypeOf<LexicalBlockClientProps['path']>().toEqualTypeOf<string>();
expectTypeOf<LexicalBlockLabelClientProps['path']>().toEqualTypeOf<string>();
expectTypeOf<LexicalInlineBlockClientProps['path']>().toEqualTypeOf<string>();
expectTypeOf<LexicalInlineBlockLabelClientProps['path']>().toEqualTypeOf<string>();
