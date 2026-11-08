import { describe, expect, it, vi } from 'vitest';

import { renderRecordPanelHandler } from '../../../../../packages/ui/src/admin/views/panel/renderRecordPanel.js';

describe('renderRecordPanelHandler', () => {
  it('checks admin access before rendering a custom panel', async () => {
    const findByID = vi.fn(() => Promise.resolve({ id: 1, secret: true }));
    const req = {
      i18n: {},
      payload: {
        collections: {
          custom: {
            config: { custom: { frogbot: { panel: { Component: 'x#Y' } } }, slug: 'custom' },
          },
          customers: { config: { access: { admin: () => false }, slug: 'customers' } },
        },
        config: { admin: { user: 'users' } },
        findByID,
      },
      user: { collection: 'customers', id: 3 },
    };

    const outcome = await renderRecordPanelHandler({
      collectionSlug: 'custom',
      id: 1,
      importMap: {},
      permissions: {},
      req,
    } as never).then(
      (value) => value,
      (error: unknown) => ({ error }),
    );

    expect(outcome).toHaveProperty('error');
    expect(findByID).not.toHaveBeenCalled();
  });
});
