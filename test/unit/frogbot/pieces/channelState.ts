import { createChannelStateAdapter } from '../../../../packages/frogbot/src/channels/state.js';
import type { KV } from '../../../../packages/frogbot/src/kv/types.js';
import { channelFixture } from '../channels/helpers.js';

export function conformanceChannelState() {
  const { kv } = channelFixture();

  return createChannelStateAdapter({ kv: kv as unknown as KV, namespace: 'conformance' });
}
