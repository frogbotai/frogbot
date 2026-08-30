import { describe, expect, it } from 'vitest';

import { buildChatEndpoints } from '../../../../packages/frogbot/src/chat/endpoints.js';
import type { FrogbotRequest } from '../../../../packages/frogbot/src/types/request.js';

describe('chat endpoints', () => {
  it('rejects anonymous title suggestions', async () => {
    const endpoint = buildChatEndpoints().find(
      (item) => item.path === '/frogbot/chat/suggest-title',
    );
    const response = await endpoint!.handler({} as FrogbotRequest);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });
});
