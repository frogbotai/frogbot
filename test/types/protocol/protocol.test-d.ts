import type * as protocol from '@frogbotai/protocol';
import type { SerializedThread } from 'chat';
import type {
  AgentManifestEntry,
  AgentModelId,
  AgentProfile,
  AgentReasoningOption,
  ChannelThreadReference,
  OptionColor,
  TurnErrorCode,
  TurnState,
} from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { optionColors } from '../../../packages/frogbot/src/fields/config/types.js';

expectTypeOf<TurnState>().toEqualTypeOf<protocol.TurnState>();
expectTypeOf<TurnErrorCode>().toEqualTypeOf<protocol.TurnErrorCode>();
expectTypeOf<OptionColor>().toEqualTypeOf<protocol.OptionColor>();
expectTypeOf<AgentProfile>().toEqualTypeOf<protocol.AgentProfile>();
expectTypeOf<AgentReasoningOption>().toEqualTypeOf<protocol.AgentReasoningOption>();

expectTypeOf<AgentManifestEntry>().toEqualTypeOf<protocol.AgentManifestEntry<AgentModelId>>();

expectTypeOf<ChannelThreadReference>().toEqualTypeOf<
  protocol.ChannelThreadReference<Omit<SerializedThread, 'currentMessage'>>
>();

expectTypeOf<(typeof optionColors)[number]>().toEqualTypeOf<protocol.OptionColor>();

expectTypeOf<protocol.ChannelThreadReference['thread']>().toBeUnknown();
expectTypeOf<protocol.AgentManifestEntry['defaultModel']>().toBeString();

expectTypeOf<protocol.ChatManifest['agents'][number]>().toEqualTypeOf<
  protocol.AgentManifestEntry & { profile?: protocol.AgentProfile }
>();
