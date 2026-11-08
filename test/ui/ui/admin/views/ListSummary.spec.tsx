import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@payloadcms/ui', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;

  return {
    Popup: ({
      button,
      buttonAriaLabel,
      render,
    }: {
      button: ReactNode;
      buttonAriaLabel: string;
      render: (args: { close: () => void }) => ReactNode;
    }) => (
      <div aria-label={buttonAriaLabel} role="group">
        {button}
        <div role="menu">{render({ close: () => undefined })}</div>
      </div>
    ),
    PopupList: {
      Button: ({
        active,
        children,
        onClick,
      }: {
        active?: boolean;
        children: ReactNode;
        onClick: () => void;
      }) => (
        <button data-active={active} onClick={onClick} role="menuitem" type="button">
          {children}
        </button>
      ),
      ButtonGroup: Pass,
    },
    useConfig: () => ({ config: { admin: { dateFormat: 'yyyy-MM-dd' }, routes: { api: '/api' } } }),
    useTableColumns: () => ({
      columns: [
        { accessor: 'name', active: true, field: { name: 'name', label: 'Name', type: 'text' } },
        {
          accessor: 'amount',
          active: true,
          field: { name: 'amount', label: 'Amount', type: 'number' },
        },
        {
          accessor: 'margin',
          active: true,
          field: { name: 'margin', label: 'Margin', type: 'number' },
        },
        {
          accessor: 'closedAt',
          active: true,
          field: { name: 'closedAt', label: 'Closed', type: 'date' },
        },
      ],
    }),
    useTranslation: () => ({ i18n: { language: 'en', t: (key: string) => key } }),
  };
});

const { ListSummary } =
  await import('../../../../../packages/ui/src/admin/views/List/summary/ListSummary.client.js');

type Pending = { resolve: (response: Response) => void; url: string; init?: RequestInit };

function mockFetch() {
  const calls: Pending[] = [];
  const fetch = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        calls.push({ init, resolve, url });
      }),
  );

  vi.stubGlobal('fetch', fetch);

  return calls;
}

const json = (body: unknown, ok = true) =>
  ({ json: () => Promise.resolve(body), ok }) as unknown as Response;

async function settle(call: Pending | undefined, response: Response) {
  await act(async () => {
    call?.resolve(response);
    await Promise.resolve();
  });
}

const totals = (values: Record<string, unknown>) => json({ groups: [{ group: {}, values }] });

function Table({ children }: { children?: ReactNode }) {
  return (
    <div className="table">
      <div>
        <table>
          <thead>
            <tr>
              <th id="heading-_select" />
              <th data-column="name" />
              <th data-column="amount" />
              <th data-column="margin" />
              <th id="heading-closedAt" />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}

const columns = {
  name: { kind: 'other', operations: ['count'] },
  amount: { kind: 'number', operations: ['count', 'sum', 'avg', 'min', 'max'] },
  closedAt: { kind: 'date', operations: ['count', 'min', 'max'] },
} as const;

function setup(
  props: { saved?: Record<string, 'avg' | 'none'>; where?: Record<string, unknown> } = {},
) {
  const ref = createRef<HTMLDivElement>();

  const view = (where = props.where) => (
    <div ref={ref}>
      <Table />
      <ListSummary
        collectionSlug="deals"
        columns={columns}
        containerRef={ref}
        defaults={{ amount: 'sum', name: 'count' }}
        preferenceKey="collection-deals-view-list"
        saved={props.saved ?? {}}
        where={where}
      />
    </div>
  );

  const result = render(view());

  return {
    ...result,
    rerenderWhere: (where: Record<string, unknown>) => result.rerender(view(where)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListSummary', () => {
  it('renders one footer cell per header cell, with no control on a refused column', async () => {
    const calls = mockFetch();
    const { container } = setup();

    await waitFor(() => expect(calls).toHaveLength(1));

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      draft: true,
      values: { name: { count: true }, amount: { sum: 'amount' } },
    });

    await settle(calls[0], totals({ name: 3, amount: 1250 }));

    const cells = container.querySelectorAll('table > tfoot > tr > td');

    expect(cells).toHaveLength(5);
    expect(cells[0].textContent).toBe('');
    expect(within(cells[1] as HTMLElement).getByRole('button').textContent).toBe('Count3');
    expect(within(cells[2] as HTMLElement).getByRole('button').textContent).toBe('Sum1,250');
    expect(cells[3].querySelector('button')).toBeNull();
    expect(screen.getByRole('group', { name: 'Closed: Summarize' })).toBeTruthy();
  });

  it('lists only the operations a column takes, plus None', async () => {
    mockFetch();
    setup();

    const date = await screen.findByRole('group', { name: 'Closed: Summarize' });
    const text = await screen.findByRole('group', { name: /^Name:/ });

    expect(
      within(date)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Count', 'Earliest', 'Latest', 'None']);

    expect(
      within(text)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Count', 'None']);
  });

  it('keeps the last totals while a request is pending and clears them when it fails', async () => {
    const calls = mockFetch();
    const { rerenderWhere } = setup();

    await waitFor(() => expect(calls).toHaveLength(1));
    await settle(calls[0], totals({ name: 3, amount: 1250 }));

    expect(screen.getByRole('group', { name: 'Amount: Sum 1,250' })).toBeTruthy();

    rerenderWhere({ stage: { equals: 'won' } });
    await waitFor(() => expect(calls).toHaveLength(2));

    expect(JSON.parse(String(calls[1].init?.body)).where).toEqual({ stage: { equals: 'won' } });
    expect(screen.getByRole('group', { name: 'Amount: Sum 1,250' })).toBeTruthy();

    await settle(calls[1], json({ errors: [] }, false));

    expect(screen.getByRole('group', { name: 'Amount: Sum' })).toBeTruthy();
  });

  it("saves a choice into the view preference without touching the setup's other keys", async () => {
    const calls = mockFetch();

    setup();

    await waitFor(() => expect(calls).toHaveLength(1));
    await settle(calls[0], totals({ name: 3, amount: 1250 }));

    const amount = screen.getByRole('group', { name: /^Amount:/ });

    fireEvent.click(within(amount).getByRole('menuitem', { name: 'Average' }));

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));

    const read = calls.find(
      (call) => call.url === '/api/payload-preferences/collection-deals-view-list',
    );

    expect(read?.init?.method).toBeUndefined();

    await settle(
      read,
      json({ value: { columns: [{ accessor: 'name', active: true }], summary: { name: 'none' } } }),
    );

    await waitFor(() =>
      expect(
        calls.some((call) => call.init?.method === 'POST' && call.url.includes('preferences')),
      ).toBe(true),
    );

    const write = calls.find(
      (call) => call.init?.method === 'POST' && call.url.includes('preferences'),
    );

    expect(JSON.parse(String(write?.init?.body))).toEqual({
      value: { columns: [{ accessor: 'name', active: true }], summary: { amount: 'avg' } },
    });

    const request = calls.find((call, index) => index > 0 && call.url === '/api/deals/aggregate');

    expect(JSON.parse(String(request?.init?.body)).values.amount).toEqual({ avg: 'amount' });
  });

  it('drops a config default the user set to None', async () => {
    const calls = mockFetch();

    setup({ saved: { amount: 'none' } });

    await waitFor(() => expect(calls).toHaveLength(1));

    expect(JSON.parse(String(calls[0].init?.body)).values).toEqual({ name: { count: true } });
    expect(screen.getByRole('group', { name: 'Amount: Summarize' })).toBeTruthy();
  });
});
