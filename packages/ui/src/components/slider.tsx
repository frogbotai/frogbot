'use client';

import type { ComponentProps, CSSProperties } from 'react';

export type SliderProps = Omit<
  ComponentProps<'input'>,
  'children' | 'defaultValue' | 'max' | 'min' | 'onChange' | 'step' | 'type' | 'value'
> & {
  stops: readonly string[];
  value: number;
  onValueChange: (value: number) => void;
};

export function Slider({ className, stops, value, onValueChange, ...props }: SliderProps) {
  const last = Math.max(stops.length - 1, 0);

  const style = {
    '--fb-slider-count': Math.max(stops.length, 1),
    '--fb-slider-progress': last ? value / last : 0,
  } as CSSProperties;

  return (
    <div className={`fb-slider${className ? ` ${className}` : ''}`} style={style}>
      <input
        type="range"
        className="fb-slider__input"
        min={0}
        max={last}
        step={1}
        value={value}
        aria-valuetext={stops[value]}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        {...props}
      />
      <div className="fb-slider__stops" aria-hidden="true">
        {stops.map((stop, index) => (
          <span
            key={`${index}-${stop}`}
            className={`fb-slider__stop${index === value ? ' fb-slider__stop--active' : ''}`}
          >
            {stop}
          </span>
        ))}
      </div>
    </div>
  );
}
