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
  /** Bars side by side, or stacked when the series add up to a total. */
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

function niceScale(value: number): { max: number; step: number } {
  const rough = Math.max(value, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].find((factor) => factor * power >= rough) ?? 10) * power;

  return { max: Math.max(Math.ceil(value / step), 1) * step, step };
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
  max,
  plot,
  height,
}: {
  height: number;
  labels: string[];
  max: number;
  plot: number;
  series: ChartSeries[];
  stacked?: boolean;
}) {
  const band = plot / labels.length;
  const inner = band * 0.64;
  const width = stacked ? inner : inner / series.length;

  return labels.map((label, index) => {
    let base = height;

    return (
      <g key={label}>
        {series.map((item, position) => {
          const top = !stacked || series.slice(position + 1).every((next) => !next.values[index]);
          const value = item.values[index] ?? 0;
          const size = (value / max) * height;
          const x = AXIS + index * band + (band - inner) / 2 + (stacked ? 0 : position * width);
          const y = stacked ? base - size : height - size;

          if (stacked) base -= size;

          return (
            <rect
              className={`fb-chart__bar fb-chart__series-${position + 1}`}
              height={Math.max(size, 0) + (stacked && top && position > 0 && size > 0 ? 3 : 0)}
              key={item.name}
              rx={top ? Math.min(3, width / 4) : 0}
              width={Math.max(width - (stacked ? 0 : 2), 1)}
              x={x}
              y={y}
            >
              <title>{`${label} · ${item.name}: ${value}`}</title>
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
  const totals = labels.map((_, index) =>
    stacked
      ? series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0)
      : Math.max(...series.map((item) => item.values[index] ?? 0)),
  );

  const { max, step: tickStep } = niceScale(Math.max(...totals));
  const ticks = Array.from(
    { length: Math.round(max / tickStep) + 1 },
    (_, index) => tickStep * index,
  );

  const step = labels.length > 1 ? plot / (labels.length - 1) : 0;
  const band = plot / labels.length;
  const every = Math.ceil(labels.length / 12);

  return (
    <div className={`fb-chart${className ? ` ${className}` : ''}`} {...props}>
      {series.length > 1 && (
        <ul className="fb-chart__legend">
          {series.map((item, index) => (
            <li key={item.name}>
              <span className={`fb-chart__swatch fb-chart__series-${index + 1}`} />
              {item.name}
            </li>
          ))}
        </ul>
      )}
      <svg
        className="fb-chart__plot"
        role="img"
        aria-label={series.map((item) => item.name).join(', ')}
        viewBox={`0 -8 ${WIDTH} ${height + 32}`}
      >
        {ticks.map((tick) => {
          const y = height - (tick / max) * height;

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
              key={label}
              textAnchor="middle"
              x={type === 'bar' ? AXIS + index * band + band / 2 : AXIS + index * step}
              y={height + 22}
            >
              {label}
            </text>
          ),
        )}
        {type === 'bar' ? (
          <Bars
            height={height}
            labels={labels}
            max={max}
            plot={plot}
            series={series}
            stacked={stacked}
          />
        ) : (
          series.map((item, index) => (
            <g className={`fb-chart__series-${index + 1}`} key={item.name}>
              <polyline
                className="fb-chart__line"
                points={points(item.values, plot, height, max)}
                transform={`translate(${AXIS} 0)`}
              />
              {item.values.map((value, point) => (
                <circle
                  className="fb-chart__point"
                  cx={AXIS + point * step}
                  cy={height - (value / max) * height}
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
