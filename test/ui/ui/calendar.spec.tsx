import { readFileSync } from 'node:fs';

import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EventChip } from '../../../packages/ui/src/calendar/EventChip.js';
import { MonthGrid } from '../../../packages/ui/src/calendar/MonthGrid.js';
import { TimeGrid } from '../../../packages/ui/src/calendar/TimeGrid.js';

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
