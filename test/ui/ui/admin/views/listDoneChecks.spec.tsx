import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let permissions: unknown;

const refresh = vi.fn();

const allowed = {
  collections: { tasks: { fields: { completed: { update: true } }, update: true } },
};

vi.mock('@payloadcms/ui', () => ({
  toast: { error: vi.fn() },
  useAuth: () => ({ permissions }),
  useConfig: () => ({
    config: { routes: { api: '/api' } },
    getEntityConfig: () => ({
      admin: { custom: { frogbot: { useAsDone: 'completed' } }, useAsTitle: 'title' },
      slug: 'tasks',
    }),
  }),
  useRouter: () => ({ refresh }),
}));

const { ListDoneChecks } =
  await import('../../../../../packages/ui/src/admin/views/List/ListDoneChecks.client');

function Harness({ doneEditable, doneIds }: { doneEditable?: string[]; doneIds: string[] }) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={ref}>
        <div className="table">
          <table>
            <tbody>
              <tr data-id="1">
                <td className="cell-title">
                  <a href="#">Write brief</a>
                </td>
              </tr>
              <tr data-id="2">
                <td className="cell-title">
                  <a href="#">Book the venue</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <ListDoneChecks
        collectionSlug="tasks"
        containerRef={ref}
        doneEditable={doneEditable}
        doneIds={doneIds}
      />
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe('ListDoneChecks', () => {
  it('is read-only when field-level update access on the done field is denied', async () => {
    permissions = {
      collections: { tasks: { fields: { completed: { update: false } }, update: true } },
    };

    const { findAllByRole } = render(<Harness doneIds={[]} />);

    const buttons = await findAllByRole('button', { name: 'Mark complete' });

    expect(buttons.map((button) => button.hasAttribute('disabled'))).toEqual([true, true]);
  });

  it('shows the saved state when the save fails', async () => {
    permissions = allowed;

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ errors: [{ message: 'nope' }] }, { status: 403 })),
      ),
    );

    const { findAllByRole } = render(<Harness doneIds={[]} />);
    const [button] = await findAllByRole('button', { name: 'Mark complete' });

    act(() => {
      fireEvent.click(button);
    });

    expect(button.getAttribute('aria-pressed')).toBe('true');

    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('false'));
  });

  it('is read-only on the rows whose record update access denies', async () => {
    permissions = allowed;

    const { findAllByRole } = render(<Harness doneEditable={['2']} doneIds={[]} />);
    const buttons = await findAllByRole('button', { name: 'Mark complete' });

    expect(buttons.map((button) => button.hasAttribute('disabled'))).toEqual([true, false]);
  });

  it('shows the saved state when the server answers 200 but did not save the done field', async () => {
    permissions = allowed;

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ doc: { completed: false, id: 1 } }))),
    );

    const { findAllByRole, rerender } = render(<Harness doneIds={[]} />);
    const [button] = await findAllByRole('button', { name: 'Mark complete' });

    act(() => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    rerender(<Harness doneIds={[]} />);
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('false'));
  });

  it("keeps row B's check when row A's refresh lands while B is saving", async () => {
    permissions = allowed;
    const resolvers: ((value: Response) => void)[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    );

    const { findAllByRole, rerender } = render(<Harness doneIds={[]} />);
    const [a, b] = await findAllByRole('button', { name: 'Mark complete' });

    fireEvent.click(a);

    act(() => {
      resolvers[0](Response.json({ doc: { completed: true, id: 1 } }));
    });

    await waitFor(() => expect(b.hasAttribute('disabled')).toBe(false));
    fireEvent.click(b);

    expect(b.getAttribute('aria-pressed')).toBe('true');

    rerender(<Harness doneIds={['1']} />);

    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });
});
