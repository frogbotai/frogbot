import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBoardTotals } from '../../../packages/ui/src/admin/views/Board/useBoardTotals';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const todo = (count: number) =>
  json({ groups: [{ group: { status: 'todo' }, values: { count } }] });

const renderTotals = () =>
  renderHook(
    ({ where }: { where?: unknown }) =>
      useBoardTotals({ api: '/api', collectionSlug: 'tasks', groupBy: 'status', where }),
    { initialProps: {} },
  );

describe('useBoardTotals', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts drafts, as the column lists do', async () => {
    const fetch = vi.fn().mockResolvedValue(todo(1));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderTotals();

    await act(() => result.current.refresh());

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ draft: true });
  });

  it('drops the totals when the aggregate is refused, so headers fall back to loaded counts', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(todo(7))
      .mockResolvedValueOnce(json({ errors: [{ message: 'Forbidden' }] }, 403));

    vi.stubGlobal('fetch', fetch);
    const { rerender, result } = renderTotals();

    await act(() => result.current.refresh());

    expect(result.current.totals).toEqual({ 'string:todo': 7 });

    rerender({ where: { priority: { equals: 'high' } } });
    await act(() => result.current.refresh());

    expect(result.current.totals).toBeUndefined();
  });

  it('keeps newer totals when an older refused request finishes last', async () => {
    let refuse: (response: Response) => void = () => {};

    const fetch = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((resolve) => (refuse = resolve)))
      .mockResolvedValueOnce(todo(3));

    vi.stubGlobal('fetch', fetch);
    const { result } = renderTotals();

    let older: Promise<void> = Promise.resolve();

    act(() => {
      older = result.current.refresh();
    });

    await act(() => result.current.refresh());

    await act(async () => {
      refuse(json({}, 400));
      await older;
    });

    expect(result.current.totals).toEqual({ 'string:todo': 3 });
  });
});
