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
  const position = Math.min(Math.max(value, 0), last);

  const style = {
    '--fb-slider-last': last,
    '--fb-slider-progress': last ? position / last : 0,
  } as CSSProperties;

  return (
    <div className={`fb-slider${className ? ` ${className}` : ''}`} style={style}>
      <span className="fb-slider__value" aria-hidden="true">
        {stops[value]}
      </span>
      <div className="fb-slider__control">
        <div className="fb-slider__track" aria-hidden="true">
          <span className="fb-slider__fill" />
          {stops.map((stop, index) => (
            <span
              key={`${index}-${stop}`}
              className={`fb-slider__dot${index < value ? ' fb-slider__dot--filled' : ''}`}
              style={{ '--fb-slider-index': index } as CSSProperties}
            />
          ))}
        </div>
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
      </div>
    </div>
  );
}
