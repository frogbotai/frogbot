import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ActivityFeed,
  Chart,
  CopyValue,
  EmptyState,
  Fact,
  FactList,
  formatValue,
  Media,
  Meter,
  PageHeader,
  PersonChip,
  ReadMore,
  RecordChip,
  ReportView,
  Stat,
  StatusBadge,
  Value,
} from '../../../../packages/ui/src/index';

const now = new Date('2026-11-22T17:00:00Z');

describe('formatValue', () => {
  it.each([
    [36577, 'number', '36,577'],
    [1_203_344, 'compact', '1.2M'],
    [4120, 'currency', '$4,120'],
    [8500.5, 'currency', '$8,500.50'],
    [0.427, 'percent', '42.7%'],
    [62, 'duration', '1:02'],
    [3725, 'duration', '1:02:05'],
  ] as const)('formats %s as %s', (value, format, expected) => {
    expect(formatValue(value, { format, locale: 'en-US' })).toBe(expected);
  });

  it('drops the year for dates in the current year only', () => {
    expect(formatValue('2026-11-18T12:00:00Z', { locale: 'en-US', now })).toBe('Nov 18');
    expect(formatValue('2025-03-14T12:00:00Z', { locale: 'en-US', now })).toBe('Mar 14, 2025');
  });

  it('says how long ago a date was', () => {
    const yesterday = new Date(now.getTime() - 26 * 3_600_000);

    expect(formatValue(yesterday, { format: 'relative', locale: 'en-US', now })).toBe('yesterday');
    expect(formatValue(now, { format: 'relative', locale: 'en-US', now })).toBe('this minute');
  });

  it('returns an empty string for missing values and the text for unparseable ones', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined)).toBe('');
    expect(formatValue('')).toBe('');
    expect(formatValue('soon', { format: 'date' })).toBe('soon');
  });
});

describe('Value', () => {
  it('keeps an empty cell blank unless a fallback is given', () => {
    const { container } = render(
      <>
        <Value value={null} />
        <Value empty="—" value={undefined} />
      </>,
    );

    const [blank, dash] = container.querySelectorAll('.fb-value');

    expect(blank?.textContent).toMatch(/^$/);
    expect(blank?.classList.contains('fb-value--empty')).toBe(true);
    expect(dash?.textContent).toBe('—');
  });
});

describe('Stat', () => {
  it('colours a rise as good, or as bad when lower is better', () => {
    const { container } = render(
      <>
        <Stat change={0.12} label="Revenue" value="$48,200" />
        <Stat change={0.12} invert label="Days to close" value="18" />
        <Stat change={0} label="Flat" value="3" />
      </>,
    );

    const deltas = container.querySelectorAll('.fb-stat__delta');

    expect(deltas[0]?.classList.contains('fb-stat__delta--good')).toBe(true);
    expect(deltas[1]?.classList.contains('fb-stat__delta--bad')).toBe(true);
    expect(deltas[2]?.classList.contains('fb-stat__delta--good')).toBe(false);
    expect(deltas[2]?.classList.contains('fb-stat__delta--bad')).toBe(false);
    expect(screen.getByText('Revenue')).toBeTruthy();
  });
});

describe('Meter', () => {
  it.each([
    [82, 'success'],
    [48, 'warning'],
    [12, 'danger'],
  ])('picks a tone for %s out of 100', (value, tone) => {
    const { container } = render(<Meter label="Fit score" value={value} />);

    expect(container.firstElementChild?.classList.contains(`fb-meter--${tone}`)).toBe(true);
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe(String(value));
  });

  it('clamps the value and shows it against a custom maximum', () => {
    render(<Meter label="Onboarding" max={8} tone="neutral" value={11} />);

    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('8');
    expect(screen.getByText('8 / 8')).toBeTruthy();
  });
});

describe('StatusBadge, chips and facts', () => {
  it('renders a status tone with its dot', () => {
    const { container } = render(<StatusBadge tone="warning">Needs approval</StatusBadge>);

    expect(container.firstElementChild?.classList.contains('fb-status-badge--warning')).toBe(true);
    expect(container.querySelector('.fb-status-badge__dot')).not.toBeNull();
  });

  it('links a chip when it has an href', () => {
    render(
      <>
        <PersonChip email="jordan@example.com" name="Jordan Reyes" />
        <RecordChip href="/invoices/2094" label="INV-2094" />
      </>,
    );

    expect(screen.getByText('JR')).toBeTruthy();
    expect(screen.getByRole('link', { name: /INV-2094/ }).getAttribute('href')).toBe(
      '/invoices/2094',
    );
  });

  it('shows a dash for an empty fact', () => {
    render(
      <FactList>
        <Fact label="Owner">Jordan Reyes</Fact>
        <Fact label="Notes">{null}</Fact>
      </FactList>,
    );

    expect(screen.getByText('Notes').nextElementSibling?.textContent).toBe('—');
  });
});

describe('Chart', () => {
  it('puts axis ticks on round steps', () => {
    const { container } = render(
      <Chart labels={['W1', 'W2']} series={[{ name: 'Hours', values: [12, 30] }]} type="bar" />,
    );

    const ticks = [...container.querySelectorAll('.fb-chart__axis')]
      .map((tick) => tick.textContent)
      .filter((text) => /^\d/.test(text ?? ''));

    expect(ticks).toEqual(['0', '10', '20', '30']);
  });
});

describe('Media', () => {
  it('keeps its shape when given a style, and shows a placeholder for a broken image', () => {
    const { container } = render(
      <Media alt="Short" ratio="9/16" src="/missing.png" style={{ width: '6rem' }} />,
    );

    const frame = container.firstElementChild as HTMLElement;

    expect(frame.style.aspectRatio).toBe('9 / 16');
    expect(frame.style.width).toBe('6rem');

    fireEvent.error(container.querySelector('img') as HTMLImageElement);

    expect(
      screen.getByRole('img', { name: 'Short' })?.classList.contains('fb-media__placeholder'),
    ).toBe(true);
  });
});

describe('CopyValue', () => {
  it('masks a key but copies all of it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyValue mask value="sk_live_1234567890abcd" />);

    expect(screen.getByText(/abcd$/)?.textContent).toMatch(/^•+abcd$/);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('sk_live_1234567890abcd');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });
});

describe('ReportView, ActivityFeed, PageHeader and EmptyState', () => {
  it('renders markdown tables inside a scroll wrapper', () => {
    const { container } = render(
      <ReportView>
        {'# Findings\n\n| Feature | Posts |\n| --- | --- |\n| Has a number | 1,297 |'}
      </ReportView>,
    );

    expect(screen.getByRole('heading', { name: 'Findings' })).toBeTruthy();
    expect(container.querySelector('.fb-report__table-wrap table')).not.toBeNull();
  });

  it('marks agents apart from people in the feed', () => {
    const { container } = render(
      <ActivityFeed
        items={[
          {
            id: '1',
            actor: { name: 'Invoice agent', agent: true },
            action: 'asked for approval',
            time: now,
          },
          { id: '2', actor: { name: 'Jordan Reyes' }, action: 'approved the entry', time: now },
        ]}
        now={now}
      />,
    );

    expect(container.querySelectorAll('.fb-agent-avatar')).toHaveLength(1);
    expect(screen.getByText('JR')).toBeTruthy();
    expect(screen.getAllByText('this minute')).toHaveLength(2);
  });

  it('renders a page header and an empty state with their actions', () => {
    render(
      <>
        <PageHeader
          actions={<button type="button">Create invoice</button>}
          description="Waiting: 2"
          title="Invoices"
        />
        <EmptyState action={<button type="button">Add a contact</button>} title="No contacts yet" />
      </>,
    );

    expect(screen.getByRole('heading', { name: 'Invoices' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeTruthy();
    expect(screen.getByText('No contacts yet')).toBeTruthy();
  });
});

describe('edge cases', () => {
  it('reads a number held in a string as a number, with no date tooltip', () => {
    const { container } = render(<Value format="currency" locale="en-US" value="4120" />);

    expect(formatValue('42', { locale: 'en-US' })).toBe('42');
    expect(container.firstElementChild?.textContent).toBe('$4,120');
    expect(container.firstElementChild?.getAttribute('title')).toBeNull();
  });

  it('keeps the calendar day of a date-only string in any timezone', () => {
    expect(formatValue('2026-11-18', { locale: 'en-US', now })).toBe('Nov 18');
  });

  it('leaves bad numbers blank and signs negative durations', () => {
    expect(formatValue(Number.NaN)).toBe('');
    expect(formatValue(Number.POSITIVE_INFINITY, { format: 'duration' })).toBe('');
    expect(formatValue(-90, { format: 'duration' })).toBe('-1:30');
  });

  it('keeps the feed when one time is unreadable', () => {
    render(
      <ActivityFeed
        items={[{ id: '1', action: 'did it', actor: { name: 'Ann Lee' }, time: 'not a date' }]}
      />,
    );

    expect(screen.getByText('did it')).toBeTruthy();
  });

  it('draws negative bars and lines inside the plot, and describes the data', () => {
    const { container } = render(
      <>
        <Chart labels={['a', 'b']} series={[{ name: 'Profit', values: [-5, 10] }]} type="bar" />
        <Chart labels={['a', 'b']} series={[{ name: 'Change', values: [-50, 10] }]} />
      </>,
    );

    const [bar] = container.querySelectorAll('rect');
    const ys = (container.querySelector('polyline')?.getAttribute('points') ?? '')
      .split(' ')
      .map((point) => Number(point.split(',')[1]));

    expect(Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'))).toBeLessThanOrEqual(
      200,
    );
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(screen.getAllByRole('img')[0].getAttribute('aria-label')).toBe('Profit: a -5, b 10');
  });

  it('names the meter by its label and treats NaN as 0', () => {
    render(<Meter label="Fit score" value={Number.NaN} />);

    expect(screen.getByRole('meter', { name: 'Fit score' }).getAttribute('aria-valuenow')).toBe(
      '0',
    );
  });

  it('says when copying fails', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    });

    document.execCommand = vi.fn(() => false);

    render(<CopyValue value="abc" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await screen.findByRole('button', { name: "Couldn't copy" })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't copy/);
  });

  it('passes props through a chip without a link, and shows initials until a picture loads', () => {
    render(<PersonChip data-testid="chip" name="Jo Reyes" src="https://example.com/jo.png" />);

    expect(screen.getByTestId('chip').textContent).toBe('JRJo Reyes');
  });

  it('shows Show more when text that fit is cut after a resize', () => {
    let resize = () => {};

    let height = 40;

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback;
        }

        disconnect() {}

        observe() {}
      },
    );

    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => 40);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);

    render(<ReadMore>{'long text '.repeat(50)}</ReadMore>);

    expect(screen.queryByRole('button')).toBeNull();

    height = 120;
    act(() => resize());

    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
