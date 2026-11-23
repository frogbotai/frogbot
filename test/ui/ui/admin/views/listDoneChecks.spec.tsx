import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let permissions: unknown;

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
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { ListDoneChecks } =
  await import('../../../../../packages/ui/src/admin/views/List/ListDoneChecks.client');

function Harness({ doneIds }: { doneIds: string[] }) {
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
            </tbody>
          </table>
        </div>
      </div>
      <ListDoneChecks collectionSlug="tasks" containerRef={ref} doneIds={doneIds} />
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ListDoneChecks', () => {
  it('is read-only when field-level update access on the done field is denied', async () => {
    permissions = {
      collections: { tasks: { fields: { completed: { update: false } }, update: true } },
    };

    const { findByRole } = render(<Harness doneIds={[]} />);

    expect(await findByRole('button', { name: 'Mark complete' })).toHaveProperty('disabled', true);
  });

  it('shows the saved state when the save fails', async () => {
    permissions = {
      collections: { tasks: { fields: { completed: { update: true } }, update: true } },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ errors: [{ message: 'nope' }] }, { status: 403 })),
      ),
    );

    const { findByRole } = render(<Harness doneIds={[]} />);
    const button = await findByRole('button', { name: 'Mark complete' });

    act(() => {
      fireEvent.click(button);
    });

    expect(button.getAttribute('aria-pressed')).toBe('true');

    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('false'));
  });
});
