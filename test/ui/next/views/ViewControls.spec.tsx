import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
      const [drawer, setDrawer] = useState<string>();
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            'aria-expanded': drawer === 'sort',
            id: 'toggle-list-sort',
            onClick: () => setDrawer(drawer === 'sort' ? undefined : 'sort'),
          },
          'Sort',
        ),
        createElement(
          'button',
          {
            'aria-expanded': drawer === 'columns',
            onClick: () => setDrawer(drawer === 'columns' ? undefined : 'columns'),
          },
          'Columns',
        ),
      );
    },
  };
});

vi.mock('../../../../packages/next/src/views/controls/SortBuilder.client.js', () => ({
  SortBuilder: mocks.SortBuilder,
}));

const { ViewControls } =
  await import('../../../../packages/next/src/views/controls/ViewControls.client.js');

const collectionConfig = {
  admin: { groupBy: true },
  fields: [],
  slug: 'posts',
};

describe('ViewControls', () => {
  it('passes native control props and only overrides disabled Group By', () => {
    render(
      <ViewControls
        collectionConfig={collectionConfig as never}
        collectionSlug="posts"
        enableGroupBy={false}
        enableSort
      />,
    );

    expect(mocks.ListControls).toHaveBeenLastCalledWith(
      expect.objectContaining({
        collectionConfig: expect.objectContaining({
          admin: expect.objectContaining({ groupBy: false }),
        }),
        collectionSlug: 'posts',
        enableSort: true,
      }),
    );
  });

  it('synchronizes the custom drawer with the native expanded state', async () => {
    render(
      <ViewControls
        collectionConfig={collectionConfig as never}
        collectionSlug="posts"
        enableSort
      />,
    );

    expect(screen.getByTestId('sort-height').getAttribute('data-height')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    await waitFor(() =>
      expect(screen.getByTestId('sort-height').getAttribute('data-height')).toBe('auto'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    await waitFor(() =>
      expect(screen.getByTestId('sort-height').getAttribute('data-height')).toBe('0'),
    );
  });
});
