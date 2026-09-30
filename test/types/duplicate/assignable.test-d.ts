import type {
  Access,
  Block,
  CollectionConfig,
  Connections,
  Field,
  FrogBot,
  FrogBotInstance,
  FrogBotRequest,
  FrogBotSanitizedConfig,
  Jobs,
  PieceInstance,
} from 'frogbot';
import type * as Copy from 'frogbot-copy';
import { expectTypeOf } from 'vitest';

expectTypeOf<Copy.FrogBot>().toExtend<FrogBot>();
expectTypeOf<FrogBot>().toExtend<Copy.FrogBot>();

expectTypeOf<Copy.FrogBotInstance>().toExtend<FrogBotInstance>();
expectTypeOf<FrogBotInstance>().toExtend<Copy.FrogBotInstance>();

expectTypeOf<Copy.FrogBotRequest>().toExtend<FrogBotRequest>();
expectTypeOf<FrogBotRequest>().toExtend<Copy.FrogBotRequest>();

expectTypeOf<Copy.Connections>().toExtend<Connections>();
expectTypeOf<Connections>().toExtend<Copy.Connections>();

expectTypeOf<Copy.Connections['store']>().toExtend<Connections['store']>();
expectTypeOf<Connections['store']>().toExtend<Copy.Connections['store']>();

expectTypeOf<Copy.FrogBot['triggers']>().toExtend<FrogBot['triggers']>();
expectTypeOf<FrogBot['triggers']>().toExtend<Copy.FrogBot['triggers']>();

expectTypeOf<Copy.PieceInstance>().toExtend<PieceInstance>();
expectTypeOf<PieceInstance>().toExtend<Copy.PieceInstance>();

expectTypeOf<Copy.Jobs>().toExtend<Jobs>();
expectTypeOf<Jobs>().toExtend<Copy.Jobs>();

expectTypeOf<Copy.FrogBotSanitizedConfig>().toExtend<FrogBotSanitizedConfig>();
expectTypeOf<FrogBotSanitizedConfig>().toExtend<Copy.FrogBotSanitizedConfig>();

expectTypeOf<FrogBot['email']>().not.toBeAny();

declare const sharedAccess: Copy.Access;
declare const sharedBlock: Copy.Block;
declare const sharedCollection: Copy.CollectionConfig;
declare const sharedField: Copy.Field;

const access: Access = sharedAccess;
const block: Block = sharedBlock;
const field: Field = sharedField;

export const pages: CollectionConfig = {
  slug: 'pages',
  access: { read: access },
  fields: [field, { name: 'layout', type: 'blocks', blocks: [block, sharedBlock] }],
};

export const collections: CollectionConfig[] = [pages, sharedCollection];
