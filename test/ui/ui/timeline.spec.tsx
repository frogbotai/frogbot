import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarHeader } from '../../../packages/ui/src/calendar/CalendarHeader.js';
import type { TimelineItem } from '../../../packages/ui/src/timeline/core.js';
import { Timeline, type TimelineProps } from '../../../packages/ui/src/timeline/Timeline.js';

type Task = TimelineItem & { band: string; title: string };

const tasks: Task[] = [
  {
    band: 'web',
    end: '2026-06-18T17:00:00.000Z',
    id: 'copy',
    start: '2026-06-15T17:00:00.000Z',
    title: 'Write copy',
  },
  {
    band: 'web',
    end: '2026-06-19T17:00:00.000Z',
    id: 'design',
    start: '2026-06-17T17:00:00.000Z',
    title: 'Design pricing',
  },
  { band: 'mobile', end: '2026-06-24T17:00:00.000Z', id: 'invite', title: 'Invite testers' },
  { band: 'web', id: 'undated', title: 'No dates' },
];

const DAY_WIDTH = 50;

function renderTimeline(props: Partial<TimelineProps<Task>> = {}) {
  return render(
    <Timeline<Task>
      bands={[
        { key: 'web', label: 'Website' },
        { key: 'mobile', label: 'Mobile' },
        { key: 'ops', label: 'Ops' },
      ]}
      date="2026-06-17"
      getBand={(task) => task.band}
      items={tasks}
      renderBar={(task) => task.title}
      scale="day"
      timeZone="UTC"
      {...props}
    />,
  );
}

const bar = (title: string) =>
  screen.getByText(title).closest<HTMLElement>('.frog-timeline__bar') as HTMLElement;

const edgeOf = (title: string, edge: 'end' | 'start') =>
  bar(title).querySelector<HTMLElement>(`[data-edge="${edge}"]`) as HTMLElement;

function pointer(target: Element | Window, type: string, clientX: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, button: 0, clientX }));
}

function drag(target: Element, from: number, to: number) {
  pointer(target, 'pointerdown', from);
  pointer(window, 'pointermove', from + (to - from) / 2);
  pointer(window, 'pointermove', to);
  pointer(window, 'pointerup', to);
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-06-17T12:00:00.000Z'), toFake: ['Date'] });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.classList.contains('frog-timeline__track') ? DAY_WIDTH * 14 : 0;

    return { bottom: 0, height: 0, left: 0, right: width, top: 0, width, x: 0, y: 0 } as DOMRect;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('timeline UI', () => {
  it('draws one band per group with bars on their days, stacking overlaps', () => {
    const { container } = renderTimeline();
    const labels = [...container.querySelectorAll('.frog-timeline__band-label')].map(
      (label) => label.textContent,
    );

    expect(labels).toEqual(['Website', 'Mobile', 'Ops']);
    expect(screen.getByText('Jun 14 – Jun 27, 2026')).toBeTruthy();

    expect(bar('Write copy').style.left).toBe(`${(1 / 14) * 100}%`);
    expect(bar('Write copy').style.width).toBe('calc(28.5714% - 4px)');
    expect(bar('Design pricing').style.top).not.toBe(bar('Write copy').style.top);
    expect(bar('Invite testers').style.left).toBe(`${(10 / 14) * 100}%`);
    expect(bar('Invite testers').style.width).toBe('calc(7.14286% - 4px)');
    expect(screen.queryByText('No dates')).toBeNull();

    const ops = container.querySelector('[data-band="ops"]') as HTMLElement;

    expect(within(ops).queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelector('.frog-timeline__tick--today')?.textContent).toBe('Wed 17');
  });

  it('moves a bar by whole days and saves both dates once', async () => {
    const onMove = vi.fn();
    const onOpen = vi.fn();

    renderTimeline({ onMove, onOpen });

    await act(async () => {
      drag(bar('Write copy'), 100, 100 + DAY_WIDTH * 3 + 10);
      await Promise.resolve();
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0][0]).toMatchObject({
      end: '2026-06-21T17:00:00.000Z',
      start: '2026-06-18T17:00:00.000Z',
    });
    expect(bar('Write copy').style.left).toBe(`${(4 / 14) * 100}%`);

    fireEvent.click(bar('Write copy'));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('puts a bar back when its save fails', async () => {
    const onMove = vi.fn().mockRejectedValue(new Error('Denied'));

    renderTimeline({ onMove });

    await act(async () => {
      drag(bar('Write copy'), 100, 100 + DAY_WIDTH * 2);
      await Promise.resolve();
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(bar('Write copy').style.left).toBe(`${(1 / 14) * 100}%`);
  });

  it('resizes from either edge and fills in a missing start', async () => {
    const onResize = vi.fn();

    renderTimeline({ onResize });

    await act(async () => {
      drag(edgeOf('Write copy', 'end'), 250, 250 + DAY_WIDTH);
      await Promise.resolve();
    });

    expect(onResize.mock.calls[0][0]).toMatchObject({
      end: '2026-06-19T17:00:00.000Z',
      start: '2026-06-15T17:00:00.000Z',
    });

    await act(async () => {
      drag(edgeOf('Invite testers', 'start'), 500, 500 - DAY_WIDTH * 2);

      await Promise.resolve();
    });

    expect(onResize.mock.calls[1][0]).toMatchObject({
      end: '2026-06-24T17:00:00.000Z',
      start: '2026-06-22T17:00:00.000Z',
    });
  });

  it('opens a bar on click or Enter, and an Escape cancels a drag', async () => {
    const onMove = vi.fn();
    const onOpen = vi.fn();

    renderTimeline({ onMove, onOpen });

    pointer(bar('Design pricing'), 'pointerdown', 200);
    pointer(window, 'pointerup', 200);
    fireEvent.click(bar('Design pricing'));
    fireEvent.keyDown(bar('Invite testers'), { key: 'Enter' });

    expect(onOpen.mock.calls.map(([task]) => (task as Task).id)).toEqual(['design', 'invite']);

    await act(async () => {
      pointer(bar('Design pricing'), 'pointerdown', 200);
      pointer(window, 'pointermove', 400);
      fireEvent.keyDown(window, { key: 'Escape' });
      pointer(window, 'pointerup', 400);
      await Promise.resolve();
    });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows no handles and no drag without edit access or an end field', async () => {
    const onMove = vi.fn();
    const view = renderTimeline({ canEdit: () => false, onMove });

    expect(view.container.querySelectorAll('.frog-timeline__resize')).toHaveLength(0);

    await act(async () => {
      drag(bar('Write copy'), 100, 300);
      await Promise.resolve();
    });

    expect(onMove).not.toHaveBeenCalled();

    view.unmount();
    const resizable = renderTimeline({ canResize: false });

    expect(resizable.container.querySelectorAll('.frog-timeline__resize')).toHaveLength(0);
    expect(bar('Write copy').className).toContain('frog-timeline__bar--editable');
  });

  it('navigates and switches scale from the shared calendar header', () => {
    const onNavigate = vi.fn();
    const onSetScale = vi.fn();
    const { container } = renderTimeline({ onNavigate, onSetScale, scale: 'week' });

    expect(container.querySelectorAll('.frog-timeline__tick')).toHaveLength(8);

    fireEvent.click(screen.getByLabelText('Next'));
    fireEvent.click(screen.getByRole('button', { name: 'month' }));

    expect(onNavigate.mock.calls[0][0]).toMatch(/^2026-07-15/);
    expect(onSetScale).toHaveBeenCalledWith('month');
  });

  it('draws one unlabeled band without bands and clips bars at the range', () => {
    const { container } = renderTimeline({
      bands: undefined,
      getBand: undefined,
      items: [
        {
          band: '',
          end: '2026-07-10T12:00:00.000Z',
          id: 'long',
          start: '2026-06-01T12:00:00.000Z',
          title: 'Long',
        },
      ],
    });

    expect(container.querySelector('.frog-timeline__grid--unlabeled')).toBeTruthy();
    expect(bar('Long').className).toContain('frog-timeline__bar--clipped-start');
    expect(bar('Long').className).toContain('frog-timeline__bar--clipped-end');
    expect(bar('Long').querySelectorAll('.frog-timeline__resize')).toHaveLength(0);
  });

  it('keeps the calendar header label unless given one', () => {
    render(<CalendarHeader date="2026-06-17" mode="month" navigate={vi.fn()} timeZone="UTC" />);

    expect(screen.getByText('June 2026')).toBeTruthy();
  });
});
