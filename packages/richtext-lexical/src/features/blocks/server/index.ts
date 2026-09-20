import {
  BlocksFeature as upstreamBlocksFeature,
  type BlocksFeatureProps as UpstreamBlocksFeatureProps,
  type LexicalBlockClientProps as PayloadLexicalBlockClientProps,
  type LexicalBlockLabelClientProps as PayloadLexicalBlockLabelClientProps,
  type LexicalBlockLabelServerProps as PayloadLexicalBlockLabelServerProps,
  type LexicalBlockServerProps as PayloadLexicalBlockServerProps,
  type LexicalInlineBlockClientProps as PayloadLexicalInlineBlockClientProps,
  type LexicalInlineBlockLabelClientProps as PayloadLexicalInlineBlockLabelClientProps,
  type LexicalInlineBlockLabelServerProps as PayloadLexicalInlineBlockLabelServerProps,
  type LexicalInlineBlockServerProps as PayloadLexicalInlineBlockServerProps,
} from '@payloadcms/richtext-lexical';
import type { Field, FrogbotRequest } from 'frogbot';
import type { Block, BlockSlug } from 'payload';

type BlockInput = Omit<Block, 'fields'> & { fields: Field[] };
type RuntimeFields = Block['fields'] & Field[];

export type BlocksFeatureProps = Omit<UpstreamBlocksFeatureProps, 'blocks' | 'inlineBlocks'> & {
  blocks?: (BlockInput | BlockSlug)[];
  inlineBlocks?: (BlockInput | BlockSlug)[];
};

function adaptBlocks(blocks: BlocksFeatureProps['blocks']): UpstreamBlocksFeatureProps['blocks'] {
  return blocks?.map((block) => {
    if (typeof block === 'string') return block;

    return {
      ...block,
      fields: block.fields as RuntimeFields,
    };
  });
}

export const BlocksFeature = (props?: BlocksFeatureProps) =>
  upstreamBlocksFeature({
    ...props,
    blocks: adaptBlocks(props?.blocks),
    inlineBlocks: adaptBlocks(props?.inlineBlocks),
  });

export type LexicalBlockClientProps = PayloadLexicalBlockClientProps;
export type LexicalBlockLabelClientProps = PayloadLexicalBlockLabelClientProps;
export type LexicalInlineBlockClientProps = PayloadLexicalInlineBlockClientProps;
export type LexicalInlineBlockLabelClientProps = PayloadLexicalInlineBlockLabelClientProps;
export type LexicalBlockServerProps = Omit<PayloadLexicalBlockServerProps, 'payload' | 'req'> & {
  req: FrogbotRequest;
};
export type LexicalBlockLabelServerProps = Omit<
  PayloadLexicalBlockLabelServerProps,
  'payload' | 'req'
> & { req: FrogbotRequest };
export type LexicalInlineBlockServerProps = Omit<
  PayloadLexicalInlineBlockServerProps,
  'payload' | 'req'
> & { req: FrogbotRequest };
export type LexicalInlineBlockLabelServerProps = Omit<
  PayloadLexicalInlineBlockLabelServerProps,
  'payload' | 'req'
> & { req: FrogbotRequest };
