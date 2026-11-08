import { readFileSync } from 'node:fs';

import { DndContext } from '@dnd-kit/core';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventChip } from '../../../packages/ui/src/calendar/EventChip.js';
import { MonthGrid } from '../../../packages/ui/src/calendar/MonthGrid.js';
import { TimeGrid, type TimeGridProps } from '../../../packages/ui/src/calendar/TimeGrid.js';
import { useBrowserTimeZone } from '../../../packages/ui/src/calendar/useBrowserTimeZone.js';
import { useCalendar } from '../../../packages/ui/src/calendar/useCalendar.js';

const event = {
  end: '2026-09-08T11:00:00.000Z',
  id: 'event-1',
  start: '2026-09-06T10:00:00.000Z',
  title: 'Planning',
};

describe('calendar UI', () => {
  it('renders a time grid from plain events and hides its drag source', () => {
    const view = render(
      <TimeGrid
        date="2026-09-06T12:00:00.000Z"
        events={[{ ...event, end: '2026-09-06T11:00:00.000Z' }]}
        mode="week"
        onNavigate={vi.fn()}
        renderEvent={(item) => item.title}
      />,
    );

    expect(screen.getByText('Planning')).toBeTruthy();

    view.rerender(
      <DndContext>
        <EventChip event={event} hidden renderEvent={(item) => item.title} />
        <div className="frog-calendar__overlay">Planning overlay</div>
      </DndContext>,
    );

    expect(view.container.querySelector('.frog-calendar__event--dragging')).toBeTruthy();
    expect(view.container.querySelectorAll('.frog-calendar__overlay')).toHaveLength(1);
  });

  it('keeps the drag source in layout so the overlay can measure it', () => {
    const css = readFileSync('packages/ui/src/calendar/calendar.css', 'utf8');
    const rule = css.match(/\.frog-calendar__event--dragging\s*{([^}]*)}/)?.[1] ?? '';

    expect(rule).toContain('opacity: 0');
    expect(rule).not.toContain('display');

    render(
      <TimeGrid
        date="2026-09-06T12:00:00.000Z"
        events={[
          { ...event, end: '2026-09-06T11:00:00.000Z' },
          { ...event, end: '2026-09-06T11:00:00.000Z', id: 'event-2', title: 'Overlap' },
        ]}
        mode="week"
        onNavigate={vi.fn()}
        renderEvent={(item) => item.title}
      />,
    );

    const chip = screen.getByText('Planning').closest<HTMLElement>('.frog-calendar__event');

    expect(chip?.style.width).toBe('50%');
    expect(chip?.style.height).not.toBe('');
  });

  it('renders six by seven month cells, multi-day placement, and overflow', () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      ...event,
      id: `event-${index}`,
      title: `Event ${index}`,
    }));

    const { container } = render(
      <MonthGrid
        date="2026-09-06T12:00:00.000Z"
        events={events}
        mode="month"
        onNavigate={vi.fn()}
        renderEvent={(item) => item.title}
      />,
    );

    expect(container.querySelectorAll('.frog-calendar__month-cell')).toHaveLength(42);
    expect(container.querySelectorAll('.frog-calendar__event').length).toBeGreaterThan(4);
    expect(screen.getAllByText('+1 more').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText('Event 0')[0]
        ?.closest('.frog-calendar__month-cell')
        ?.querySelector('.frog-calendar__month-date')?.textContent,
    ).toBe('6');
  });
});

describe('calendar in Los Angeles', () => {
  const timeZone = 'America/Los_Angeles';
  const hourHeight = 56;
  const week = '2026-09-09T19:00:00.000Z';

  afterEach(() => vi.useRealTimers());

  const pointer = (type: string, clientY: number) =>
    act(() => {
      window.dispatchEvent(new MouseEvent(type, { clientY }));
    });

  function columnOf(title: string, index = 0) {
    const chip = screen.getAllByText(title)[index]?.closest<HTMLElement>('.frog-calendar__event');
    const columns = [...document.querySelectorAll('.frog-calendar__day-column')];

    return {
      chip,
      column: columns.indexOf(chip?.closest('.frog-calendar__day-column') as Element),
    };
  }

  type Event = { end?: string; id: string; start: string; title: string };

  function renderWeek(events: Event[], props: Partial<TimeGridProps<Event>> = {}) {
    return render(
      <TimeGrid
        date={week}
        events={events}
        hourHeight={hourHeight}
        mode="week"
        renderEvent={(item) => item.title}
        timeZone={timeZone}
        {...props}
      />,
    );
  }

  it('places timed events on their local day and hour', () => {
    renderWeek(
      [
        {
          end: '2026-09-06T03:00:00.000Z',
          id: 'eve',
          start: '2026-09-06T02:00:00.000Z',
          title: 'Eve',
        },
        {
          end: '2026-09-05T22:00:00.000Z',
          id: 'meet',
          start: '2026-09-05T21:00:00.000Z',
          title: 'Meet',
        },
      ],
      { date: '2026-09-05T20:00:00.000Z' },
    );

    expect(document.querySelector('.frog-calendar__days-header')?.textContent).toContain('Sat 5');
    expect(columnOf('Eve')).toMatchObject({ column: 6 });
    expect(columnOf('Eve').chip?.style.top).toBe(`${19 * hourHeight}px`);
    expect(columnOf('Meet')).toMatchObject({ column: 6 });
    expect(columnOf('Meet').chip?.style.top).toBe(`${14 * hourHeight}px`);
  });

  it('draws the current-time line in the local today column at the local time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T03:30:00.000Z'));
    renderWeek([], { date: '2026-09-05T20:00:00.000Z' });

    const lines = document.querySelectorAll<HTMLElement>('.frog-calendar__now');
    const columns = [...document.querySelectorAll('.frog-calendar__day-column')];

    expect(lines).toHaveLength(1);
    expect(columns.indexOf(lines[0].closest('.frog-calendar__day-column')!)).toBe(6);
    expect(lines[0].style.top).toBe(`${20.5 * hourHeight}px`);
  });

  it('shows an overnight event in both columns, clipped to each day', () => {
    renderWeek([
      {
        end: '2026-09-08T11:00:00.000Z',
        id: 'late',
        start: '2026-09-08T05:00:00.000Z',
        title: 'Late',
      },
    ]);

    const first = columnOf('Late', 0);
    const second = columnOf('Late', 1);

    expect([first.column, second.column]).toEqual([1, 2]);
    expect([first.chip?.style.top, first.chip?.style.height]).toEqual([
      `${22 * hourHeight}px`,
      `${2 * hourHeight}px`,
    ]);
    expect([second.chip?.style.top, second.chip?.style.height]).toEqual([
      '0px',
      `${4 * hourHeight}px`,
    ]);
    expect(within(first.chip!).queryByLabelText('Resize end')).toBeNull();
    expect(within(first.chip!).getByLabelText('Resize start')).toBeTruthy();
    expect(within(second.chip!).queryByLabelText('Resize start')).toBeNull();
    expect(within(second.chip!).getByLabelText('Resize end')).toBeTruthy();
  });

  it.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'Etc/GMT+12'])(
    'shows a date-only value all day on its stored date in %s',
    (zone) => {
      renderWeek([{ id: 'due', start: '2026-09-07T12:00:00.000Z', title: 'Due' }], {
        dateOnly: true,
        timeZone: zone,
      });

      const cells = [...document.querySelectorAll('.frog-calendar__all-day-cell')];
      const chip = screen.getByText('Due').closest('.frog-calendar__all-day-cell');

      expect(document.querySelector('.frog-calendar__days-header')?.textContent).toContain('Sun 6');
      expect(cells.indexOf(chip as Element)).toBe(1);
      expect(screen.queryByLabelText('Resize end')).toBeNull();
    },
  );

  it('shows a timed event of a day or more in the all-day row on its local days', () => {
    renderWeek([
      {
        end: '2026-09-09T05:00:00.000Z',
        id: 'trip',
        start: '2026-09-08T05:00:00.000Z',
        title: 'Trip',
      },
    ]);

    const cells = [...document.querySelectorAll('.frog-calendar__all-day-cell')];
    const chips = screen
      .getAllByText('Trip')
      .map((chip) => chip.closest('.frog-calendar__all-day-cell'));

    expect(chips.map((cell) => cells.indexOf(cell as Element))).toEqual([1, 2]);
  });

  it('knows no time zone on the server, so the server renders no grid', () => {
    function Zone() {
      return <span>{useBrowserTimeZone() ?? 'none'}</span>;
    }

    expect(renderToString(<Zone />)).toContain('none');

    render(<Zone />);

    expect(screen.getByText(Intl.DateTimeFormat().resolvedOptions().timeZone)).toBeTruthy();
  });

  it('shows no resize handles and ignores resizes when there is no end to save', async () => {
    const event = {
      end: '2026-09-08T18:00:00.000Z',
      id: 'a',
      start: '2026-09-08T17:00:00.000Z',
      title: 'A',
    };

    renderWeek([event], { canResize: false });

    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.queryByLabelText('Resize end')).toBeNull();
    expect(screen.queryByLabelText('Resize start')).toBeNull();

    const onResize = vi.fn();
    const events = [event];
    const { result } = renderHook(() =>
      useCalendar({
        canResize: false,
        date: week,
        events,
        mode: 'week',
        onResize,
        timeZone,
      }),
    );

    await result.current.handlers.resize(event, 'end', '2026-09-08T20:00:00.000Z');

    expect(onResize).not.toHaveBeenCalled();
  });

  it('previews a resize while dragging, saves on release and restores on Escape', () => {
    const onResize = vi.fn();

    renderWeek(
      [{ end: '2026-09-08T18:00:00.000Z', id: 'a', start: '2026-09-08T17:00:00.000Z', title: 'A' }],
      { mode: 'day', onResize, date: '2026-09-08T19:00:00.000Z' },
    );

    const column = document.querySelector<HTMLElement>('.frog-calendar__day-column')!;
    column.getBoundingClientRect = () => ({ height: 24 * hourHeight, top: 0 }) as DOMRect;
    const chip = () => screen.getByText('A').closest<HTMLElement>('.frog-calendar__event')!;

    expect(chip().style.height).toBe(`${hourHeight}px`);

    fireEvent.pointerDown(screen.getByLabelText('Resize end'));
    pointer('pointermove', 13 * hourHeight);

    expect(chip().style.height).toBe(`${3 * hourHeight}px`);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(chip().style.height).toBe(`${hourHeight}px`);

    pointer('pointerup', 13 * hourHeight);

    expect(onResize).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByLabelText('Resize end'));
    pointer('pointermove', 12 * hourHeight);

    expect(chip().style.height).toBe(`${2 * hourHeight}px`);

    pointer('pointerup', 12 * hourHeight);

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize.mock.calls[0]?.[0]).toMatchObject({ end: '2026-09-08T19:00:00.000Z' });
    expect(chip().style.height).toBe(`${2 * hourHeight}px`);
  });

  it('opens a popover of the whole day from a keyboard-reachable "+N more"', async () => {
    const user = userEvent.setup();

    render(
      <MonthGrid
        date={week}
        events={Array.from({ length: 5 }, (_, index) => ({
          end: '2026-09-08T18:00:00.000Z',
          id: `e${index}`,
          start: '2026-09-08T17:00:00.000Z',
          title: `Busy ${index}`,
        }))}
        mode="month"
        renderEvent={(item) => item.title}
        timeZone={timeZone}
      />,
    );

    expect(screen.queryByText('Busy 4')).toBeNull();

    const more = screen.getByRole('button', { name: '+2 more' });
    more.focus();
    await user.keyboard('{Enter}');

    const list = await screen.findByRole('dialog');

    expect(within(list).getAllByText(/^Busy \d$/)).toHaveLength(5);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
