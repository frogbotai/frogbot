import * as upstream from '@payloadcms/live-preview-react';
import { describe, expect, it } from 'vitest';

import * as ours from '../../../packages/live-preview-react/src/index';

describe('@frogbotai/live-preview-react exports', () => {
  it('matches the upstream runtime exports', () => {
    expect(Object.keys(ours).sort()).toEqual(Object.keys(upstream).sort());
  });

  it('exports useLivePreview as a function', () => {
    expect(typeof ours.useLivePreview).toBe('function');
  });
});
