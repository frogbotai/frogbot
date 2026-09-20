import * as upstream from '@payloadcms/live-preview';
import { describe, expect, it } from 'vitest';

import * as ours from '../../../packages/live-preview/src/index';

describe('@frogbotai/live-preview exports', () => {
  it('matches the upstream runtime exports', () => {
    expect(Object.keys(ours).sort()).toEqual(Object.keys(upstream).sort());
  });
});
