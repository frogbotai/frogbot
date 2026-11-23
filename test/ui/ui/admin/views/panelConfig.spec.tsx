import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: undefined as unknown }));

const todos = {
  admin: {
    custom: { frogbot: { panel: { properties: ['owner'], width: 560 }, useAsDone: 'done' } },
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'done', type: 'checkbox' },
    { name: 'owner', type: 'text' },
    { name: 'notes', type: 'textarea' },
  ],
  slug: 'todos',
};

vi.mock('@payloadcms/ui', () => ({
  ConfigProvider: ({ children, config }: { children: ReactNode; config: unknown }) => {
    mocks.config = config;

    return children;
  },
  useConfig: () => ({
    config: { collections: [todos] },
    getEntityConfig: () => todos,
  }),
}));

const { PanelConfig } =
  await import('../../../../../packages/ui/src/admin/views/panel/PanelConfig.client.js');

describe('PanelConfig', () => {
  it('leaves the title, the properties and the useAsDone field out of the panel body', () => {
    render(<PanelConfig collectionSlug="todos">body</PanelConfig>);

    const { collections } = mocks.config as { collections: Array<{ fields: { name: string }[] }> };

    expect(collections[0].fields.map((field) => field.name)).toEqual(['notes']);
  });
});
