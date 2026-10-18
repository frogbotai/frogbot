import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ListControls: vi.fn(),
  SortBuilder: vi.fn(() => null),
}));

vi.mock('@payloadcms/ui', async () => {
  const { createElement, useState } = await import('react');

  return {
    AnimateHeight: ({ children, height }: { children: React.ReactNode; height: number | string }) =>
      createElement('div', { 'data-height': height, 'data-testid': 'sort-height' }, children),
    ListControls: (props: Record<string, unknown>) => {
      mocks.ListControls(props);
      const [open, setOpen] = useState(false);

      return createElement('button', {
        'aria-expanded': open,
        id: 'toggle-list-sort',
        onClick: () => setOpen(!open),
        type: 'button',
      });
    },
  };
});

vi.mock('../../../../../packages/ui/src/admin/views/controls/SortBuilder.client.js', () => ({
  SortBuilder: mocks.SortBuilder,
}));

const { ViewControls } =
  await import('../../../../../packages/ui/src/admin/views/controls/ViewControls.client.js');

const collectionConfig = {
  admin: {},
  fields: [{ name: 'title', label: 'Title', type: 'text' }],
  slug: 'posts',
};

const renderControls = (props: Record<string, unknown> = {}) =>
  render(
    <ViewControls collectionConfig={collectionConfig as never} collectionSlug="posts" {...props} />,
  );

beforeEach(() => {
  mocks.ListControls.mockClear();
  mocks.SortBuilder.mockClear();
});

describe('ViewControls', () => {
  it("passes every prop but the manual sort field to Payload's list controls", () => {
    renderControls({ enableSort: true, manualSortField: '_order_by_stage' });

    expect(mocks.ListControls).toHaveBeenCalledWith(
      expect.objectContaining({ collectionSlug: 'posts', enableSort: true }),
    );
    expect(mocks.ListControls.mock.calls[0][0]).not.toHaveProperty('manualSortField');
  });

  it('renders no sort builder unless sort is enabled', () => {
    renderControls();

    expect(screen.queryByTestId('sort-height')).toBeNull();
    expect(mocks.SortBuilder).not.toHaveBeenCalled();
  });

  it("opens the sort builder when Payload's Sort button expands", async () => {
    renderControls({ enableSort: true, manualSortField: '_order_by_stage' });

    expect(screen.getByTestId('sort-height').dataset.height).toBe('0');
    expect(mocks.SortBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ collectionSlug: 'posts', manualField: '_order_by_stage' }),
      undefined,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByTestId('sort-height').dataset.height).toBe('auto'));
  });
});
