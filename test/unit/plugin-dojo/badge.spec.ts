import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DojoBadge } from '../../../packages/plugins/plugin-dojo/src/client/DojoBadge.js';

describe('DojoBadge on the server', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders only its children and makes no request', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const child = createElement('main', { id: 'app' }, 'App page');
    const html = renderToString(createElement(DojoBadge, null, child));

    expect(html).toBe(renderToString(child));
    expect(html).not.toContain('fb-dojo-badge');
    expect(fetch).not.toHaveBeenCalled();
  });
});
