import * as upstream from '@payloadcms/live-preview-vue';
import { describe, expect, it } from 'vitest';

import * as ours from '../../../packages/live-preview-vue/src/index';

describe('@frogbotai/live-preview-vue exports', () => {
  it('matches the upstream runtime exports', () => {
    expect(Object.keys(ours).sort()).toEqual(Object.keys(upstream).sort());
  });

  it('exports useLivePreview as a function', () => {
    expect(typeof ours.useLivePreview).toBe('function');
  });
});
