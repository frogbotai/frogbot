import { act, render, screen, waitFor } from '@testing-library/react';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posts = vi.hoisted(() => new Map<string, () => void>());

vi.mock('@frogbotai/ui/admin', () => ({
  PanelSection: ({ children }: { children: unknown }) => <section>{children as never}</section>,
  toast: { error: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
}));

vi.mock('../../../packages/plugins/plugin-comments/src/client/CommentBox.js', () => ({
  CommentBox: ({ onPosted, target }: { onPosted: () => void; target: { documentId: string } }) => {
    posts.set(String(target.documentId), onPosted);

    return <div data-testid="box" />;
  },
  errorOf: () => Promise.resolve(''),
}));

vi.mock('../../../packages/plugins/plugin-comments/src/client/CommentList.js', () => ({
  CommentList: ({ comments }: { comments: unknown[] }) => (
    <ul data-testid="list">{comments.length}</ul>
  ),
}));

const { Comments } =
  await import('../../../packages/plugins/plugin-comments/src/client/Comments.js');

const { PinnedCommentBox } =
  await import('../../../packages/plugins/plugin-comments/src/client/PinnedCommentBox.js');

const { CommentBoxFooter } =
  await import('../../../packages/plugins/plugin-comments/src/rsc/CommentBoxFooter.js');

const target = { collection: 'tasks', commentsSlug: 'comments', documentId: 4 };
const comment = {
  id: 1,
  author: 2,
  body: null,
  createdAt: '2026-11-22T00:00:00.000Z',
  updatedAt: '2026-11-22T00:00:00.000Z',
};

const fetchMock = vi.fn(() =>
  Promise.resolve({ json: () => Promise.resolve({ docs: [comment] }), ok: true }),
);

beforeEach(() => {
  posts.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('pinned comment box', () => {
  it('keeps the box in the list when no box is pinned', () => {
    render(<Comments initial={[]} schemaPath="collection.comments.body" target={target} />);

    expect(screen.getAllByTestId('box')).toHaveLength(1);
  });

  it("hides the list's box while one is pinned, and reloads the list when the pinned box posts", async () => {
    const view = render(
      <>
        <Comments initial={[]} schemaPath="collection.comments.body" target={target} />
        <PinnedCommentBox
          schemaPath="collection.comments.body"
          target={{ ...target, documentId: '4' }}
        />
      </>,
    );

    expect(screen.getAllByTestId('box')).toHaveLength(1);
    expect(screen.getByTestId('list').textContent).toBe('0');

    act(() => posts.get('4')?.());

    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('1'));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender(<Comments initial={[]} schemaPath="collection.comments.body" target={target} />);

    expect(screen.getAllByTestId('box')).toHaveLength(1);
  });

  it('reloads a list that mounts after the pinned box posted, as when its tab opens again', async () => {
    const list = <Comments initial={[]} schemaPath="collection.comments.body" target={target} />;
    const pinned = <PinnedCommentBox schemaPath="collection.comments.body" target={target} />;
    const view = render(
      <>
        <div>{list}</div>
        {pinned}
      </>,
    );

    view.rerender(
      <>
        <div />
        {pinned}
      </>,
    );

    act(() => posts.get('4')?.());

    expect(fetchMock).not.toHaveBeenCalled();

    view.rerender(
      <>
        <div>{list}</div>
        {pinned}
      </>,
    );

    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('1'));
  });

  it('still shows a pinned post after its list was open, then its tab closed and reopened', async () => {
    const other = { ...target, documentId: 41 };
    const list = <Comments initial={[]} schemaPath="collection.comments.body" target={other} />;
    const pinned = <PinnedCommentBox schemaPath="collection.comments.body" target={other} />;
    const view = render(
      <>
        <div>{list}</div>
        {pinned}
      </>,
    );

    act(() => posts.get('41')?.());
    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('1'));

    view.rerender(
      <>
        <div />
        {pinned}
      </>,
    );

    view.rerender(
      <>
        <div>{list}</div>
        {pinned}
      </>,
    );

    await waitFor(() => expect(screen.getByTestId('list').textContent).toBe('1'));
  });

  it("leaves another record's list alone", () => {
    render(
      <>
        <Comments
          initial={[]}
          schemaPath="collection.comments.body"
          target={{ ...target, documentId: 5 }}
        />
        <PinnedCommentBox schemaPath="collection.comments.body" target={target} />
      </>,
    );

    expect(screen.getAllByTestId('box')).toHaveLength(2);
  });
});

describe('CommentBoxFooter', () => {
  const payload = {
    collections: { users: { config: { admin: { useAsTitle: 'name' } } } },
    config: {
      custom: {
        'plugin-comments': {
          bodies: { tasks: 'body_0' },
          commentsSlug: 'comments',
          userSlug: 'users',
        },
      },
    },
    find: vi.fn(),
    findByID: () => Promise.resolve({ id: 4, createdAt: '2026-11-01T00:00:00.000Z' }),
  };

  const req = { payload, user: { id: 1 } } as never;

  it('renders nothing on a create form or for a collection without comments', async () => {
    expect(await CommentBoxFooter({ collectionSlug: 'tasks', id: '', req })).toBeNull();
    expect(await CommentBoxFooter({ collectionSlug: 'notes', id: 4, req })).toBeNull();
  });

  it("pins the record's box with the same target as its list", async () => {
    const node = await CommentBoxFooter({ collectionSlug: 'tasks', id: 4, req });

    expect(isValidElement(node)).toBe(true);

    expect((node as ReactElement<Record<string, unknown>>).props).toEqual({
      schemaPath: 'collection.comments.body_0',
      target: {
        collection: 'tasks',
        commentsSlug: 'comments',
        documentId: 4,
        since: '2026-11-01T00:00:00.000Z',
        titleField: 'name',
      },
    });
  });
});
