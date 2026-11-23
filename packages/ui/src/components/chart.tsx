import type { HTMLAttributes } from 'react';

import { formatValue, type ValueFormatOptions } from './value.js';

export type ChartSeries = {
  /** Shown in the legend and the tooltip. */
  name: string;
  /** One value per label, in the same order. */
  values: number[];
};

export type ChartProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** How each value reads on the axis and in tooltips. */
  format?: ValueFormatOptions;
  /** Height of the plot in pixels. Default 200. */
  height?: number;
  /** One label per point along the bottom axis. */
  labels: string[];
  /** One to five series; each takes the next chart colour from the theme. */
  series: ChartSeries[];
  /** Bars side by side, or stacked when the series add up to a total. Stacked bars draw values below 0 as 0. */
  stacked?: boolean;
  /** `line` for change over time, `bar` for comparing items. */
  type?: 'bar' | 'line';
};

export type SparklineProps = Omit<HTMLAttributes<SVGSVGElement>, 'children'> & {
  /** The values, oldest first. */
  data: number[];
  height?: number;
  width?: number;
};

const WIDTH = 600;

const AXIS = 40;

function niceScale(low: number, high: number): { max: number; min: number; step: number } {
  const rough = Math.max(high - low, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((factor) => factor * power >= rough) ?? 10) * power;
  const min = Math.floor(low / step) * step;

  return { max: Math.max(Math.ceil(high / step) * step, min + step), min, step };
}

function finite(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

function points(values: number[], width: number, height: number, max: number, min = 0): string {
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  return values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - ((value - min) / span) * height).toFixed(1)}`,
    )
    .join(' ');
}

/** A small trend line with no axes, for stat tiles and table cells. */
export function Sparkline({ className, data, height = 24, width = 80, ...props }: SparklineProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const up = data.length > 1 && data[data.length - 1] >= data[0];

  return (
    <svg
      aria-hidden
      className={`fb-sparkline fb-sparkline--${up ? 'up' : 'down'}${className ? ` ${className}` : ''}`}
      height={height}
      preserveAspectRatio="none"
      viewBox={`-1 -2 ${width + 2} ${height + 4}`}
      width={width}
      {...props}
    >
      <polyline className="fb-sparkline__line" points={points(data, width, height, max, min)} />
    </svg>
  );
}

function Bars({
  labels,
  series,
  stacked,
  plot,
  y: toY,
}: {
  labels: string[];
  plot: number;
  y: (value: number) => number;
  series: ChartSeries[];
  stacked?: boolean;
}) {
  const band = plot / labels.length;
  const inner = band * 0.64;
  const width = stacked ? inner : inner / series.length;

  return labels.map((label, index) => {
    let base = 0;

    return (
      <g key={index}>
        {series.map((item, position) => {
          const top =
            !stacked ||
            series.slice(position + 1).every((next) => !(finite(next.values[index]) > 0));

          const raw = finite(item.values[index]);
          const value = stacked ? Math.max(raw, 0) : raw;
          const from = stacked ? base : 0;
          const to = from + value;
          const y = Math.min(toY(from), toY(to));
          const size = Math.abs(toY(to) - toY(from));
          const x = AXIS + index * band + (band - inner) / 2 + (stacked ? 0 : position * width);

          if (stacked) base = to;

          return (
            <rect
              className={`fb-chart__bar fb-chart__series-${position + 1}`}
              height={size + (stacked && top && position > 0 && size > 0 ? 3 : 0)}
              key={position}
              rx={top ? Math.min(3, width / 4) : 0}
              width={Math.max(width - (stacked ? 0 : 2), 1)}
              x={x}
              y={y}
            >
              <title>{`${label} · ${item.name}: ${raw}`}</title>
            </rect>
          );
        })}
      </g>
    );
  });
}

/** A line or bar chart drawn in the theme's chart colours, with a light grid and a legend. */
export function Chart({
  className,
  format,
  height = 200,
  labels,
  series,
  stacked,
  type = 'line',
  ...props
}: ChartProps) {
  const plot = WIDTH - AXIS;
  const values = series.flatMap((item) => item.values.map(finite));
  const totals = labels.map((_, index) =>
    stacked
      ? series.reduce((sum, item) => sum + Math.max(finite(item.values[index]), 0), 0)
      : Math.max(0, ...series.map((item) => finite(item.values[index]))),
  );

  const {
    max,
    min,
    step: tickStep,
  } = niceScale(stacked ? 0 : Math.min(0, ...values), Math.max(0, ...totals));

  const toY = (value: number) => height - ((value - min) / (max - min)) * height;
  const ticks = Array.from(
    { length: Math.round((max - min) / tickStep) + 1 },
    (_, index) => min + tickStep * index,
  );

  const summary = series
    .map(
      (item) =>
        `${item.name}: ${labels.map((label, index) => `${label} ${formatValue(item.values[index], format)}`).join(', ')}`,
    )
    .join('; ');

  const step = labels.length > 1 ? plot / (labels.length - 1) : 0;
  const band = plot / labels.length;
  const every = Math.ceil(labels.length / 12);

  return (
    <div className={`fb-chart${className ? ` ${className}` : ''}`} {...props}>
      {series.length > 1 && (
        <ul className="fb-chart__legend">
          {series.map((item, index) => (
            <li key={index}>
              <span className={`fb-chart__swatch fb-chart__series-${index + 1}`} />
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        className="fb-chart__plot"
        role="img"
        aria-label={summary}
        viewBox={`0 -8 ${WIDTH} ${height + 32}`}
      >
        {ticks.map((tick) => {
          const y = toY(tick);

          return (
            <g key={tick}>
              <line className="fb-chart__grid" x1={AXIS} x2={WIDTH} y1={y} y2={y} />
              <text className="fb-chart__axis" textAnchor="end" x={AXIS - 8} y={y + 4}>
                {formatValue(tick, { format: 'compact', ...format })}
              </text>
            </g>
          );
        })}
        {labels.map((label, index) =>
          index % every ? null : (
            <text
              className="fb-chart__axis"
              key={index}
              textAnchor="middle"
              x={type === 'bar' ? AXIS + index * band + band / 2 : AXIS + index * step}
              y={height + 22}
            >
              {label}
            </text>
          ),
        )}
        {type === 'bar' ? (
          <Bars labels={labels} plot={plot} series={series} stacked={stacked} y={toY} />
        ) : (
          series.map((item, index) => (
            <g className={`fb-chart__series-${index + 1}`} key={index}>
              <polyline
                className="fb-chart__line"
                points={points(item.values.map(finite), plot, height, max, min)}
                transform={`translate(${AXIS} 0)`}
              />
              {item.values.map((value, point) => (
                <circle
                  className="fb-chart__point"
                  cx={AXIS + point * step}
                  cy={toY(finite(value))}
                  key={point}
                  r={point === item.values.length - 1 ? 3.5 : 0}
                >
                  <title>{`${labels[point]} · ${item.name}: ${formatValue(value, format)}`}</title>
                </circle>
              ))}
            </g>
          ))
        )}
      </svg>
    </div>
  );
}
