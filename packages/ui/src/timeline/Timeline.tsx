'use client';

import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useRef,
} from 'react';

import { CalendarHeader } from '../calendar/CalendarHeader.js';
import { dayKey } from '../calendar/core/index.js';
import {
  formatTimelineRange,
  getTimelineRange,
  layoutTimelineBars,
  stepTimelineDate,
  TIMELINE_DAY_WIDTH,
  TIMELINE_SCALES,
  type TimelineBar,
  type TimelineDateOnly,
  type TimelineEdge,
  type TimelineItem,
  type TimelineRange,
  type TimelineScale,
} from './core.js';
import { useTimeline, type UseTimelineProps } from './useTimeline.js';

/** One horizontal band of the timeline: a group, or the whole timeline when there is no grouping. */
export type TimelineBand = {
  key: string;
  label?: ReactNode;
};

export type TimelineProps<T extends TimelineItem> = UseTimelineProps<T> & {
  /** Bands from top to bottom. Leave it out for one unlabeled band. */
  bands?: TimelineBand[];
  /** Extra class names for a bar, such as a done or selected state. */
  barClassName?: (item: T) => string | undefined;
  /** Whether bars can be resized. Turn it off when there is no end date to save. */
  canResize?: boolean;
  date: string;
  dateOnly?: TimelineDateOnly;
  /** The band an item belongs to, by key. Items in no listed band are not shown. */
  getBand?: (item: T) => string;
  onNavigate?: (date: string) => void;
  onOpen?: (item: T, event: MouseEvent | KeyboardEvent) => void;
  onSetScale?: (scale: TimelineScale) => void;
  renderBar: (item: T) => ReactNode;
  scale: TimelineScale;
  scales?: TimelineScale[];
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

const ROW_HEIGHT = 32;
const TRACK_PADDING = 6;
const SINGLE_BAND: TimelineBand[] = [{ key: '' }];

type Tick = { first: number; label: string; today: boolean };

function getTicks(range: TimelineRange, scale: TimelineScale, today: string): Tick[] {
  return range.days.flatMap((key, index) => {
    const day = new Date(`${key}T12:00:00Z`);
    const zoned = new TZDate(day.getTime(), 'UTC');
    const starts =
      scale === 'day' ||
      (scale === 'week' && index % 7 === 0) ||
      (scale === 'month' && key.endsWith('-01'));

    if (!starts) return [];

    const newMonth = index === 0 || key.endsWith('-01');
    const pattern =
      scale === 'month'
        ? 'MMMM yyyy'
        : scale === 'week'
          ? 'MMM d'
          : newMonth
            ? 'EEE MMM d'
            : 'EEE d';

    const span = scale === 'day' ? 1 : scale === 'week' ? 7 : 0;

    return [
      {
        first: index,
        label: format(zoned, pattern),
        today: span > 0 && range.days.slice(index, index + span).includes(today),
      },
    ];
  });
}

const percent = (value: number, days: number) => `${(value / days) * 100}%`;

const LABEL_GAP = 6;
const MIN_INSIDE_LABEL = 48;

type LabelPlacement = { room: number; side: 'end' | 'start' };

function placeLabel(bar: HTMLElement, padding: number): LabelPlacement | undefined {
  const content = bar.querySelector<HTMLElement>(':scope > .frog-timeline__bar-content');
  const track = bar.parentElement;

  if (!content || !track) return undefined;

  const width = content.scrollWidth;
  const inside = bar.clientWidth - padding;

  if (width <= Math.ceil(inside) || inside >= MIN_INSIDE_LABEL) return undefined;

  const left = bar.offsetLeft;
  const right = left + bar.offsetWidth;
  let endLimit = track.clientWidth;
  let startLimit = 0;

  for (const other of Array.from(track.children)) {
    if (!(other instanceof HTMLElement) || other === bar) continue;
    if (!other.classList.contains('frog-timeline__bar') || other.offsetTop !== bar.offsetTop) {
      continue;
    }

    const otherRight = other.offsetLeft + other.offsetWidth;

    if (other.offsetLeft >= right) endLimit = Math.min(endLimit, other.offsetLeft);
    else if (otherRight <= left) startLimit = Math.max(startLimit, otherRight);
  }

  const endRoom = endLimit - right - LABEL_GAP * 2;
  const startRoom = left - startLimit - LABEL_GAP * 2;
  const side = endRoom >= width || endRoom >= startRoom ? 'end' : 'start';

  return { room: Math.max(0, side === 'end' ? endRoom : startRoom), side };
}

function placeLabels(grid: HTMLElement | null) {
  const bars = grid?.querySelectorAll<HTMLElement>('.frog-timeline__bar') ?? [];
  const first = bars[0];

  if (!first) return;

  const style = getComputedStyle(first);
  const padding = parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd);

  bars.forEach((bar) => {
    delete bar.dataset.labelOutside;

    const placement = placeLabel(bar, padding);

    if (!placement) return;

    bar.dataset.labelOutside = placement.side;
    bar.style.setProperty('--frog-timeline-label-room', `${placement.room}px`);
  });
}

function useOutsideLabels(grid: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => placeLabels(grid.current));

  useLayoutEffect(() => {
    const element = grid.current;

    if (!element) return;

    const observer = new ResizeObserver(() => placeLabels(element));

    observer.observe(element);

    return () => observer.disconnect();
  }, [grid]);
}

/**
 * Records as bars across time, in bands. A sideways drag moves a bar by whole days, its edges
 * change one date, and a click opens it. The band column and the scale stay pinned while the
 * track scrolls inside the timeline.
 */
export function Timeline<T extends TimelineItem>({
  bands = SINGLE_BAND,
  barClassName,
  canEdit = () => true,
  canResize = true,
  date,
  dateOnly = {},
  getBand = () => bands[0]?.key ?? '',
  items,
  onMove,
  onNavigate,
  onOpen,
  onResize,
  onSetScale,
  renderBar,
  scale,
  scales = TIMELINE_SCALES,
  timeZone,
  weekStartsOn = 0,
}: TimelineProps<T>) {
  const timeline = useTimeline({ canEdit, dateOnly, items, onMove, onResize, timeZone });
  const tracks = useRef<HTMLDivElement | null>(null);
  const range = getTimelineRange({ date, scale, timeZone, weekStartsOn });
  const days = range.days.length;
  const today = dayKey(Date.now(), timeZone);
  const todayIndex = range.days.indexOf(today);
  const ticks = getTicks(range, scale, today);
  const labelled = bands.some((band) => band.label !== undefined);

  useOutsideLabels(tracks);

  const navigate = (direction: 'next' | 'previous' | 'today') => {
    if (direction === 'today') return onNavigate?.(new Date().toISOString());

    onNavigate?.(
      stepTimelineDate({ date, direction: direction === 'next' ? 1 : -1, scale, timeZone }),
    );
  };

  const dayWidth = () => {
    const track = tracks.current?.querySelector('.frog-timeline__track');

    return track ? track.getBoundingClientRect().width / days : 0;
  };

  const press = (item: T, kind: 'move' | TimelineEdge) => (pointer: PointerEvent<HTMLElement>) => {
    if (kind !== 'move') pointer.stopPropagation();
    timeline.begin(item, kind, pointer, dayWidth());
  };

  const open = (item: T) => (event: MouseEvent | KeyboardEvent) => {
    if (timeline.wasDragged()) return;
    onOpen?.(item, event);
  };

  const onKeyDown = (item: T) => (keyboard: KeyboardEvent<HTMLElement>) => {
    if (keyboard.target !== keyboard.currentTarget) return;
    if (keyboard.key !== 'Enter' && keyboard.key !== ' ') return;
    keyboard.preventDefault();
    onOpen?.(item, keyboard);
  };

  const renderTimelineBar = (bar: TimelineBar<T>) => {
    const { item } = bar;
    const editable = canEdit(item);
    const edges: TimelineEdge[] =
      editable && canResize
        ? [
            ...(bar.clippedStart ? [] : (['start'] as const)),
            ...(bar.clippedEnd ? [] : (['end'] as const)),
          ]
        : [];

    const classes = [
      'frog-timeline__bar',
      editable ? 'frog-timeline__bar--editable' : '',
      timeline.drag?.id === item.id ? 'frog-timeline__bar--dragging' : '',
      bar.clippedStart ? 'frog-timeline__bar--clipped-start' : '',
      bar.clippedEnd ? 'frog-timeline__bar--clipped-end' : '',
      barClassName?.(item) ?? '',
    ];

    return (
      <div
        className={classes.filter(Boolean).join(' ')}
        data-id={item.id}
        key={item.id}
        onClick={open(item)}
        onKeyDown={onKeyDown(item)}
        onPointerDown={press(item, 'move')}
        role="button"
        style={
          {
            '--frog-timeline-bar-color': item.color,
            left: percent(bar.first, days),
            top: TRACK_PADDING + bar.row * ROW_HEIGHT,
            width: `calc(${percent(bar.last - bar.first + 1, days)} - 4px)`,
          } as CSSProperties
        }
        tabIndex={0}
      >
        <div className="frog-timeline__bar-content">{renderBar(item)}</div>
        {edges.map((edge) => (
          <span
            aria-hidden="true"
            className={`frog-timeline__resize frog-timeline__resize--${edge}`}
            data-edge={edge}
            key={edge}
            onPointerDown={press(item, edge)}
          />
        ))}
      </div>
    );
  };

  return (
    <section className="frog-timeline">
      <CalendarHeader
        date={date}
        label={formatTimelineRange(range)}
        mode={scale}
        modes={scales}
        navigate={navigate}
        setMode={onSetScale}
        timeZone={timeZone}
      />
      <div className="frog-timeline__scroll">
        <div
          className={`frog-timeline__grid${labelled ? '' : ' frog-timeline__grid--unlabeled'}`}
          ref={tracks}
          style={
            {
              '--frog-timeline-days': days,
              '--frog-timeline-day-width': `${TIMELINE_DAY_WIDTH[scale]}px`,
            } as CSSProperties
          }
        >
          <div className="frog-timeline__corner" />
          <div className="frog-timeline__scale">
            {ticks.map((tick) => (
              <span
                className={`frog-timeline__tick${tick.today ? ' frog-timeline__tick--today' : ''}`}
                key={tick.first}
                style={{ left: percent(tick.first, days) }}
              >
                {tick.label}
              </span>
            ))}
          </div>
          {bands.map((band) => {
            const layout = layoutTimelineBars(
              timeline.items.filter((item) => getBand(item) === band.key),
              range,
              dateOnly,
            );

            return (
              <Fragment key={band.key}>
                <div className="frog-timeline__band-label">
                  <span className="frog-timeline__band-name">{band.label}</span>
                </div>
                <div
                  className="frog-timeline__track"
                  data-band={band.key}
                  style={{ height: Math.max(1, layout.rows) * ROW_HEIGHT + TRACK_PADDING * 2 }}
                >
                  {ticks.map((tick) => (
                    <span
                      className="frog-timeline__line"
                      key={tick.first}
                      style={{ left: percent(tick.first, days) }}
                    />
                  ))}
                  {todayIndex >= 0 ? (
                    <span
                      className="frog-timeline__today"
                      style={{ left: percent(todayIndex, days), width: percent(1, days) }}
                    />
                  ) : null}
                  {layout.bars.map(renderTimelineBar)}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
